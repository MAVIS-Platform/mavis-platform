"use client";
import { useEffect, useMemo, useState } from "react";
import type { ArchitecturalModel } from "@/types/domain";
import { DependencyNetwork } from "./dependency-network";
import { ArchitectureDiagrams } from "./architecture-diagrams";
import { SelectionThreeE } from "./selection-three-e";
import {
  projectGraphModel,
  filterGraphCategories,
  graphSelectionVisible,
  type GraphCategory,
} from "./graph-projection";
import { computeSelectionScopeKey, type SequenceSelectionContext } from "./three-e-content";

type Props = {
  projectId?: string;
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  systemName?: string | undefined;
  mode?: "graph" | "diagram" | undefined;
};

export function ArchitecturePresentation({
  model,
  selectedId,
  onSelect,
  systemName,
  mode = "graph",
}: Props) {
  const [highlight, setHighlight] = useState<{ modelId: string; ids: string[] } | null>(null);
  const [typeFilter, setTypeFilter] = useState<{ modelId: string; hidden: GraphCategory[] }>({
    modelId: model.id,
    hidden: [],
  });
  const hiddenCategories = useMemo(
    () => (typeFilter.modelId === model.id ? typeFilter.hidden : []),
    [typeFilter, model.id],
  );
  const [expanded, setExpanded] = useState(false);
  const [origin, setOrigin] = useState<"all" | "source" | "deployment" | "runtime">("all");
  const [drilledSourceEdgeId, setDrilledSourceEdgeId] = useState<string | null>(null);
  const [sequenceContext, setSequenceContext] = useState<SequenceSelectionContext | null>(null);

  // Unified projection shared between DependencyNetwork (canvas) and SelectionThreeE (panel)
  const baseProjection = useMemo(
    () => projectGraphModel(model, expanded, origin),
    [model, expanded, origin],
  );

  const projection = useMemo(
    () => ({
      ...baseProjection,
      model: filterGraphCategories(baseProjection.model, hiddenCategories),
    }),
    [baseProjection, hiddenCategories],
  );

  useEffect(() => {
    if (mode === "graph" && selectedId && !graphSelectionVisible(projection.model, selectedId)) {
      setHighlight(null);
      setDrilledSourceEdgeId(null);
      onSelect(null);
    }
  }, [mode, selectedId, projection.model, onSelect]);

  // Reset drill-down when selection changes from outside, or when mode/model/origin/expanded changes
  useEffect(() => {
    setDrilledSourceEdgeId(null);
    if (mode !== "diagram") {
      setSequenceContext(null);
    }
  }, [model.id, mode, expanded, origin]);

  const activeRelationshipId = drilledSourceEdgeId ?? selectedId;

  const handleSelect = (id: string | null) => {
    setHighlight(null);
    setSequenceContext(null);
    if (!id) {
      setDrilledSourceEdgeId(null);
      onSelect(null);
      return;
    }
    const matchingProjectedEdge = projection.model.edges.find(
      (e) => e.id === id || e.underlyingEdgeIds?.includes(id),
    );
    if (
      matchingProjectedEdge &&
      matchingProjectedEdge.id !== id &&
      matchingProjectedEdge.underlyingEdgeIds?.includes(id)
    ) {
      onSelect(matchingProjectedEdge.id);
      setDrilledSourceEdgeId(id);
    } else {
      onSelect(id);
      setDrilledSourceEdgeId(null);
    }
  };

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
      className="space-y-2.5 [&:fullscreen]:m-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-4"
    >
      <div
        className={
          selectedId
            ? "grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] 2xl:grid-cols-[minmax(0,1fr)_480px]"
            : "min-w-0"
        }
      >
        <div className="min-w-0">
          {mode === "graph" ? (
            <DependencyNetwork
              key={model.id}
              model={model}
              selectedId={activeRelationshipId}
              onSelect={handleSelect}
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
              projection={baseProjection}
              hiddenCategories={hiddenCategories}
              onHiddenCategoriesChange={(hidden) => {
                setTypeFilter({ modelId: model.id, hidden });
                setHighlight(null);
                setDrilledSourceEdgeId(null);
              }}
            />
          ) : (
            <ArchitectureDiagrams
              key={model.id}
              model={model}
              selectedId={selectedId}
              systemName={systemName}
              onSelect={handleSelect}
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
            projectId={model.projectId}
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
            onSelect={handleSelect}
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
