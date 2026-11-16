"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  isImpactService,
  impactWarning,
  contextHref,
  type Graph,
  type Evidence,
  type Explanation,
  type Diagram,
  type Impact,
  type Model,
} from "@/lib/mainflow-api";
import { ErrorNotice, panel } from "./shell";
function useModelGraph() {
  const params = useSearchParams();
  const project = params.get("project") ?? "";
  const model = params.get("model") ?? "";
  const detail = useQuery({
    queryKey: ["model", project, model],
    queryFn: ({ signal }) =>
      api<Model & { projectId: string }>(`analyzer/models/${model}`, { signal }),
    enabled: !!project && !!model,
  });
  const matches = detail.data?.projectId === project;
  const graph = useQuery({
    queryKey: ["graph", project, model],
    queryFn: ({ signal }) => api<Graph>(`analyzer/models/${model}/graph`, { signal }),
    enabled: !!model && matches,
  });
  return {
    project,
    model,
    graph,
    detail,
    error:
      detail.error ||
      graph.error ||
      (detail.data && !matches
        ? new Error("This model belongs to another project. Choose a model above.")
        : null),
  };
}
export function ModelFlow({ mode }: { mode: "architecture" | "impact" | "explain" }) {
  const state = useModelGraph();
  if (!state.project || !state.model)
    return (
      <div className={panel}>
        Choose a project and published model above, or{" "}
        <Link className="text-primary underline" href={contextHref("/import", state.project)}>
          import source
        </Link>
        .
      </div>
    );
  if (state.error)
    return (
      <>
        <ErrorNotice error={state.error} />
        <Button
          variant="outline"
          onClick={() => {
            state.detail.refetch();
            state.graph.refetch();
          }}
        >
          Retry model
        </Button>
      </>
    );
  if (!state.graph.data) return <p>Loading model…</p>;
  return (
    <ModelContent
      key={`${state.project}:${state.model}:${mode}`}
      {...state}
      graphData={state.graph.data}
      mode={mode}
    />
  );
}
function EvidenceList({ items }: { items: Evidence[] }) {
  return items.length ? (
    <div className="space-y-3">
      {items.map((e) => (
        <article key={e.id} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{e.sourceType}</p>
          <p className="break-all text-sm font-medium">{e.locator}</p>
          {e.excerpt && (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
              {e.excerpt}
            </pre>
          )}
        </article>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No evidence recorded for this selection.</p>
  );
}
function ModelContent({
  project,
  model,
  graphData,
  mode,
}: {
  project: string;
  model: string;
  graphData: Graph;
  mode: "architecture" | "impact" | "explain";
}) {
  const params = useSearchParams();
  const [target, setTarget] = useState(params.get("target") ?? "");
  const [kind, setKind] = useState<"element" | "relationship">(
    params.get("kind") === "relationship" ? "relationship" : "element",
  );
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [question, setQuestion] = useState("");
  const [format, setFormat] = useState("MERMAID");
  const [diagram, setDiagram] = useState("");
  const exists =
    kind === "element"
      ? graphData.nodes.some((n) => n.id === target)
      : graphData.edges.some((e) => e.id === target);
  const evidence = useQuery({
    queryKey: ["evidence", project, model, kind, target],
    queryFn: ({ signal }) => api<Evidence[]>(`analyzer/evidences/${kind}/${target}`, { signal }),
    enabled: exists,
  });
  const diagrams = useQuery({
    queryKey: ["diagrams", project, model],
    queryFn: ({ signal }) => api<Diagram[]>(`analyzer/models/${model}/diagrams`, { signal }),
    enabled: mode === "architecture",
  });
  const exportFile = useMutation({
    mutationFn: async () => {
      const id = diagram || diagrams.data?.[0]?.id;
      if (!id) throw new Error("No diagram available for this model");
      const result = await api<{ content: string; format: string; modelVersionId: string }>(
        `analyzer/diagrams/${id}/export?format=${format}`,
      );
      if (result.modelVersionId !== model || typeof result.content !== "string")
        throw new Error("Export does not match the selected model");
      const ext: Record<string, string> = {
        MERMAID: "mmd",
        PLANTUML: "puml",
        DRAWIO_XML: "drawio",
        JSON: "json",
      };
      const url = URL.createObjectURL(
        new Blob([result.content], {
          type: format === "JSON" ? "application/json" : "text/plain;charset=utf-8",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `mavis-${model}.${ext[format]}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const impact = useQuery({
    queryKey: ["impact", project, model, target],
    queryFn: ({ signal }) =>
      api<Impact>(`analyzer/models/${model}/impact?targetServiceId=${target}`, { signal }),
    enabled:
      mode === "impact" &&
      exists &&
      kind === "element" &&
      graphData.nodes.some((n) => n.id === target && isImpactService(n)),
  });
  const ai = useMutation({
    mutationFn: (selection: { id: string; kind: string }) =>
      api<Explanation>("analyzer/ai/explain", {
        method: "POST",
        body: JSON.stringify({
          modelVersionId: model,
          explanationScope: selection.kind === "relationship" ? "RELATIONSHIP" : "ELEMENT",
          ...(selection.kind === "relationship"
            ? { relationshipId: selection.id }
            : { elementId: selection.id }),
          userQuestion: question,
        }),
      }),
  });
  const currentAi =
    ai.variables?.id === target && ai.variables?.kind === kind ? ai.data : undefined;
  function select(id: string, nextKind: "element" | "relationship") {
    setTarget(id);
    setKind(nextKind);
    ai.reset();
  }
  const selectedNode = graphData.nodes.find((n) => n.id === target);
  const selectedEdge = graphData.edges.find((e) => e.id === target);
  const nodes = graphData.nodes.filter((n) =>
    `${n.name} ${n.type} ${n.sourcePath ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const visible = nodes.slice(0, 120);
  const positions = new Map(
    visible.map((n, i) => [n.id, { x: 25 + (i % 4) * 230, y: 25 + Math.floor(i / 4) * 100 }]),
  );
  const name = (id: string) => graphData.nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>{graphData.nodes.length} elements</span>
        <span>{graphData.edges.length} relationships</span>
        <span className="break-all">Model {model}</span>
      </div>
      {mode === "architecture" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-sm"
              aria-label="Search graph"
              placeholder="Search name, type or source path"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.2))}>
              Zoom +
            </Button>
            <Button variant="outline" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
              Zoom −
            </Button>
            <Button variant="outline" onClick={() => setZoom(1)}>
              Reset view
            </Button>
          </div>
          <div className={`${panel} max-h-[600px] overflow-auto`}>
            <p className="mb-3 text-xs text-muted-foreground">
              Static architecture · {visible.length} of {nodes.length} matching elements shown.
              Refine search for large models. Runtime metrics are not available from static
              analysis.
            </p>
            {!nodes.length ? (
              <p>No elements match.</p>
            ) : (
              <svg
                aria-label="Architecture graph"
                width={950 * zoom}
                height={(Math.ceil(visible.length / 4) * 100 + 35) * zoom}
              >
                <defs>
                  <marker
                    id="dependency-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                <g transform={`scale(${zoom})`}>
                  {graphData.edges
                    .filter((e) => positions.has(e.sourceNodeId) && positions.has(e.targetNodeId))
                    .map((e) => {
                      const a = positions.get(e.sourceNodeId)!;
                      const b = positions.get(e.targetNodeId)!;
                      return (
                        <g
                          key={e.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${name(e.sourceNodeId)} to ${name(e.targetNodeId)}: ${e.kind}`}
                          onClick={() => select(e.id, "relationship")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") select(e.id, "relationship");
                          }}
                        >
                          <line
                            x1={a.x + 200}
                            y1={a.y + 32}
                            x2={b.x}
                            y2={b.y + 32}
                            stroke="currentColor"
                            strokeWidth={target === e.id ? 4 : 1}
                            markerEnd="url(#dependency-arrow)"
                            className="text-primary"
                          />
                          <line
                            x1={a.x + 200}
                            y1={a.y + 32}
                            x2={b.x}
                            y2={b.y + 32}
                            stroke="transparent"
                            strokeWidth={14}
                          />
                        </g>
                      );
                    })}
                  {visible.map((n) => {
                    const p = positions.get(n.id)!;
                    return (
                      <g
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${n.name}`}
                        className="cursor-pointer"
                        onClick={() => select(n.id, "element")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") select(n.id, "element");
                        }}
                      >
                        <title>
                          {n.name} · {n.type}
                        </title>
                        <rect
                          x={p.x}
                          y={p.y}
                          width={200}
                          height={64}
                          rx={9}
                          className="fill-card stroke-primary"
                          strokeWidth={target === n.id ? 3 : 1}
                        />
                        <text x={p.x + 10} y={p.y + 24} fill="currentColor" fontSize={12}>
                          {n.name.length > 25 ? n.name.slice(0, 24) + "…" : n.name}
                        </text>
                        <text x={p.x + 10} y={p.y + 46} fill="currentColor" fontSize={10}>
                          {n.type}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>
          <section className={`${panel} flex flex-wrap items-center gap-3`}>
            <h2 className="font-medium">Export diagram</h2>
            <select
              aria-label="Diagram"
              className="rounded border bg-background p-2"
              value={diagram || diagrams.data?.[0]?.id || ""}
              onChange={(e) => setDiagram(e.target.value)}
            >
              {diagrams.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.notation} · {d.level}
                </option>
              ))}
            </select>
            <select
              aria-label="Export format"
              className="rounded border bg-background p-2"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              {["MERMAID", "PLANTUML", "DRAWIO_XML", "JSON"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <Button
              disabled={!diagrams.data?.length || exportFile.isPending}
              onClick={() => exportFile.mutate()}
            >
              Download
            </Button>
            <ErrorNotice error={diagrams.error || exportFile.error} />
          </section>
        </>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${panel} space-y-3`}>
          <h2 className="font-semibold">
            {mode === "impact" ? "Select a service" : "Select an element or relationship"}
          </h2>
          <select
            aria-label="Selected element"
            className="w-full rounded border bg-background p-2"
            value={kind === "element" ? target : ""}
            onChange={(e) => select(e.target.value, "element")}
          >
            <option value="">Choose an element</option>
            {graphData.nodes
              .filter((n) => mode !== "impact" || isImpactService(n))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} · {n.type}
                </option>
              ))}
          </select>
          {mode !== "impact" && (
            <select
              aria-label="Selected relationship"
              className="w-full rounded border bg-background p-2"
              value={kind === "relationship" ? target : ""}
              onChange={(e) => select(e.target.value, "relationship")}
            >
              <option value="">Choose a relationship</option>
              {graphData.edges.map((e) => (
                <option key={e.id} value={e.id}>
                  {name(e.sourceNodeId)} → {name(e.targetNodeId)} · {e.kind}
                </option>
              ))}
            </select>
          )}
          {exists && (
            <>
              <p className="font-medium">
                {kind === "element"
                  ? selectedNode?.name
                  : `${name(selectedEdge!.sourceNodeId)} → ${name(selectedEdge!.targetNodeId)}`}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {kind === "element" ? selectedNode?.sourcePath : selectedEdge?.description}
              </p>
              <Link
                className="inline-block text-primary underline"
                href={contextHref("/explain", project, model, { target, kind })}
              >
                Explain this selection
              </Link>
              <h3 className="font-medium">Source evidence</h3>
              {evidence.isPending ? (
                <p>Loading evidence…</p>
              ) : evidence.data ? (
                <EvidenceList items={evidence.data} />
              ) : null}
              <ErrorNotice error={evidence.error} />
            </>
          )}
        </section>
        <section className={`${panel} space-y-4`}>
          {mode === "impact" ? (
            <>
              <h2 className="font-semibold">Change impact</h2>
              {!target ? (
                <p>Choose a service to calculate impact.</p>
              ) : impact.isFetching ? (
                <p>Calculating impact…</p>
              ) : impact.data ? (
                <>
                  <p>
                    {impact.data.impact.affectedServices.length} affected services
                    {impact.data.impact.truncated ? " · truncated result" : ""}
                  </p>
                  {impact.data.impact.affectedServices.map((p) => (
                    <article
                      key={`${p.serviceId}:${p.hops.join(":")}`}
                      className="rounded border p-3"
                    >
                      <p className="font-medium">
                        {impact.data!.serviceNames[p.serviceId] ?? p.serviceId}
                      </p>
                      <p>
                        {p.classification} · distance {p.distance}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {p.hops.map((id) => impact.data!.serviceNames[id] ?? id).join(" → ")}
                      </p>
                    </article>
                  ))}
                  {[
                    ...(impact.data.impact.warnings ?? []),
                    ...(impact.data.adapterWarnings ?? []),
                  ].map((w, i) => (
                    <p key={i} className="text-sm">
                      {w}
                    </p>
                  ))}
                </>
              ) : null}
              <ErrorNotice error={impact.error} />
            </>
          ) : (
            <>
              <h2 className="font-semibold">Grounded explanation</h2>
              <Input
                aria-label="Question"
                placeholder="Optional question about this selection"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <Button
                disabled={!exists || ai.isPending}
                onClick={() => ai.mutate({ id: target, kind })}
              >
                {ai.isPending ? "Generating…" : "Generate explanation"}
              </Button>
              <ErrorNotice error={ai.error} />
              {currentAi && (
                <>
                  <p className="rounded bg-muted p-2 text-xs">
                    {currentAi.providerMode} · {currentAi.epistemicBadge} · {currentAi.aiModelName}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{currentAi.explanationText}</p>
                  <EvidenceList items={currentAi.citedEvidences ?? []} />
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
