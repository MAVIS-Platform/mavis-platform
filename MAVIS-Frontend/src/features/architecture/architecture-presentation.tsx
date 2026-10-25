"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ArchitecturalModel } from "@/types/domain";
import { DependencyNetwork } from "./dependency-network";
import { ArchitectureDiagrams } from "./architecture-diagrams";
import { SelectionThreeE } from "./selection-three-e";
import { projectGraphModel } from "./graph-projection";
import { computeSelectionScopeKey, type SequenceSelectionContext } from "./three-e-content";

type Props = {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  systemName?: string | undefined;
};

export function ArchitecturePresentation({ model, selectedId, onSelect, systemName }: Props) {
  const [highlight, setHighlight] = useState<{ modelId: string; ids: string[] } | null>(null);
  const [mode, setMode] = useState<"graph" | "diagram">("graph");
  const [expanded, setExpanded] = useState(false);
  const [origin, setOrigin] = useState<"all" | "source" | "deployment" | "runtime">("all");
  const [drilledSourceEdgeId, setDrilledSourceEdgeId] = useState<string | null>(null);
  const [sequenceContext, setSequenceContext] = useState<SequenceSelectionContext | null>(null);

  // Unified projection shared between DependencyNetwork (canvas) and SelectionThreeE (panel)
  const projection = useMemo(
    () => projectGraphModel(model, expanded, origin),
    [model, expanded, origin],
  );

  // Reset drill-down when selection changes from outside, or when mode/model/origin/expanded changes
  useEffect(() => {
    setDrilledSourceEdgeId(null);
    if (mode !== "diagram") {
      setSequenceContext(null);
    }
  }, [model.id, mode, expanded, origin]);

  const activeRelationshipId = drilledSourceEdgeId ?? selectedId;

  const projectedEdge = useMemo(() => {
    if (!selectedId || mode !== "graph") return undefined;
    return projection.model.edges.find(
      (e) => e.id === selectedId || e.underlyingEdgeIds?.includes(selectedId),
    );
  }, [projection, selectedId, mode]);

  const activeSequenceContext = mode === "diagram" ? sequenceContext : null;

  return (
    <div
      data-architecture-workspace
      className="mt-5 space-y-4 [&:fullscreen]:m-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-4"
    >
      <div role="tablist" aria-label="Architecture mode" className="flex gap-2">
        <Button
          role="tab"
          aria-selected={mode === "graph"}
          variant={mode === "graph" ? "default" : "outline"}
          onClick={() => {
            setMode("graph");
            setDrilledSourceEdgeId(null);
            setSequenceContext(null);
          }}
        >
          Graph
        </Button>
        <Button
          role="tab"
          aria-selected={mode === "diagram"}
          variant={mode === "diagram" ? "default" : "outline"}
          onClick={() => {
            setMode("diagram");
            setDrilledSourceEdgeId(null);
          }}
        >
          Diagram
        </Button>
      </div>
      <div
        className={
          selectedId
            ? "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]"
            : "min-w-0"
        }
      >
        <div className="min-w-0">
          {mode === "graph" ? (
            <DependencyNetwork
              key={model.id}
              model={model}
              selectedId={activeRelationshipId}
              onSelect={(id) => {
                setHighlight(null);
                setDrilledSourceEdgeId(null);
                setSequenceContext(null);
                onSelect(id);
              }}
              highlightIds={highlight?.modelId === model.id ? highlight.ids : []}
              onClearHighlight={() => setHighlight(null)}
              expanded={expanded}
              onToggleExpanded={() => {
                setExpanded((prev) => !prev);
                setDrilledSourceEdgeId(null);
              }}
              origin={origin}
              onOriginChange={(newOrigin) => {
                setOrigin(newOrigin);
                setDrilledSourceEdgeId(null);
              }}
              projection={projection}
            />
          ) : (
            <ArchitectureDiagrams
              key={model.id}
              model={model}
              selectedId={selectedId}
              systemName={systemName}
              onSelect={(id) => {
                setHighlight(null);
                setDrilledSourceEdgeId(null);
                setSequenceContext(null);
                onSelect(id);
              }}
              onSelectSequence={(id, seqCtx) => {
                setHighlight(null);
                setDrilledSourceEdgeId(null);
                setSequenceContext(seqCtx);
                onSelect(id);
              }}
            />
          )}
        </div>
        {selectedId && (
          <SelectionThreeE
            key={computeSelectionScopeKey({
              model,
              selectedId,
              projectedEdge,
              drilledSourceEdgeId,
              sequenceContext: activeSequenceContext,
            })}
            model={model}
            selectedId={selectedId}
            projectedEdge={projectedEdge}
            drilledSourceEdgeId={drilledSourceEdgeId}
            sequenceContext={activeSequenceContext}
            onDrilldown={setDrilledSourceEdgeId}
            onSelect={(id) => {
              setHighlight(null);
              setDrilledSourceEdgeId(null);
              setSequenceContext(null);
              onSelect(id);
            }}
            onClose={() => {
              setHighlight(null);
              setDrilledSourceEdgeId(null);
              setSequenceContext(null);
              onSelect(null);
            }}
            {...(mode === "graph"
              ? { onHighlight: (ids: string[]) => setHighlight({ modelId: model.id, ids }) }
              : {})}
          />
        )}
      </div>
    </div>
  );
}
