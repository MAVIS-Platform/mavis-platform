"use client";
import { useEffect, useMemo, useState } from "react";
import type { ArchitecturalModel } from "@/types/domain";
import { DependencyNetwork } from "./dependency-network";
import { ArchitectureDiagrams } from "./architecture-diagrams";
import { SelectionThreeE } from "./selection-three-e";
import { Button } from "@/components/ui/button";
import { ServiceRelationshipFilters } from "./service-relationship-filters";
import { ServiceOverviewCanvas } from "./service-overview-canvas";
import { ServiceConnectionPanel } from "./service-connection-panel";
import {
  projectServiceOverview,
  overviewSelectionVisible,
  defaultOverviewFilters,
  type OverviewFilters,
} from "./service-overview";
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
  const [viewState, setViewState] = useState<{ modelId: string; view: "overview" | "details" }>({
    modelId: model.id,
    view: "overview",
  });
  const view = viewState.modelId === model.id ? viewState.view : "overview";
  const isOverview = mode === "graph" && view === "overview";
  const [filterState, setFilterState] = useState<{ modelId: string; filters: OverviewFilters }>({
    modelId: model.id,
    filters: defaultOverviewFilters,
  });
  const filters = useMemo(
    () => (filterState.modelId === model.id ? filterState.filters : defaultOverviewFilters),
    [filterState, model.id],
  );
  const origin = filters.origin;
  const setFilters = (next: OverviewFilters) =>
    setFilterState({ modelId: model.id, filters: next });
  const setOrigin = (next: OverviewFilters["origin"]) => setFilters({ ...filters, origin: next });
  const [connectionSelection, setConnectionSelection] = useState<{
    modelId: string;
    key: string;
  } | null>(null);
  const overview = useMemo(() => projectServiceOverview(model, filters), [model, filters]);
  const connection =
    isOverview && connectionSelection?.modelId === model.id
      ? overview.connections.find((item) => item.key === connectionSelection.key)
      : undefined;
  const scopedModel = useMemo(
    () => ({
      ...model,
      edges: model.edges.filter(
        (edge) =>
          (filters.protocol === "all" || edge.protocol === filters.protocol) &&
          (filters.uncertainty !== "uncertain" || edge.uncertain) &&
          (filters.uncertainty !== "not-flagged" || !edge.uncertain),
      ),
    }),
    [model, filters],
  );
  const [drilledSourceEdgeId, setDrilledSourceEdgeId] = useState<string | null>(null);
  const [sequenceContext, setSequenceContext] = useState<SequenceSelectionContext | null>(null);

  // Unified projection shared between DependencyNetwork (canvas) and SelectionThreeE (panel)
  const baseProjection = useMemo(
    () => projectGraphModel(scopedModel, expanded, origin),
    [scopedModel, expanded, origin],
  );

  const projection = useMemo(
    () => ({
      ...baseProjection,
      model: filterGraphCategories(baseProjection.model, hiddenCategories),
    }),
    [baseProjection, hiddenCategories],
  );

  useEffect(() => {
    if (
      mode === "graph" &&
      selectedId &&
      !(isOverview
        ? overviewSelectionVisible(overview, selectedId)
        : graphSelectionVisible(projection.model, selectedId))
    ) {
      setHighlight(null);
      setDrilledSourceEdgeId(null);
      onSelect(null);
    }
  }, [mode, selectedId, projection.model, isOverview, overview, onSelect]);
  useEffect(() => {
    if (
      connectionSelection &&
      (connectionSelection.modelId !== model.id ||
        !overview.connections.some((item) => item.key === connectionSelection.key))
    )
      setConnectionSelection(null);
  }, [connectionSelection, model.id, overview]);

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
    if (mode !== "graph" || isOverview) {
      setDrilledSourceEdgeId(null);
      onSelect(id);
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
    if (!selectedId || mode !== "graph" || isOverview) return undefined;
    return projection.model.edges.find(
      (e) => e.id === selectedId || e.underlyingEdgeIds?.includes(selectedId),
    );
  }, [projection, selectedId, mode, isOverview]);

  const activeSequenceContext = mode === "diagram" ? sequenceContext : null;
  const clearGraphSelection = () => {
    setConnectionSelection(null);
    setHighlight(null);
    setDrilledSourceEdgeId(null);
    setSequenceContext(null);
    onSelect(null);
  };
  const showDetails = () => {
    setViewState({ modelId: model.id, view: "details" });
    setConnectionSelection(null);
  };

  return (
    <div
      data-architecture-workspace
      onKeyDown={(event) => {
        if (mode === "graph" && event.key === "Escape" && !event.defaultPrevented)
          clearGraphSelection();
      }}
      className="space-y-2.5 [&:fullscreen]:m-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-4"
    >
      {mode === "graph" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <div role="group" aria-label="Graph detail level" className="flex gap-1">
            <Button
              size="sm"
              variant={isOverview ? "default" : "outline"}
              aria-pressed={isOverview}
              onClick={() => setViewState({ modelId: model.id, view: "overview" })}
            >
              Overview
            </Button>
            <Button
              size="sm"
              variant={!isOverview ? "default" : "outline"}
              aria-pressed={!isOverview}
              onClick={showDetails}
            >
              Details
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isOverview
              ? "Services and their recorded connections. Select a line to inspect its directions and evidence."
              : "Directed relationships, resources and service internals. Colors identify types, not service health."}
          </p>
          {(filters.origin !== "all" ||
            filters.protocol !== "all" ||
            filters.uncertainty !== "all") && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Active filters: {filters.origin} · {filters.protocol} · {filters.uncertainty}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setFilters(defaultOverviewFilters)}>
                Reset filters
              </Button>
            </div>
          )}
        </div>
      )}
      {mode === "graph" && !isOverview && (
        <details className="rounded-xl border bg-card p-3 text-sm">
          <summary className="cursor-pointer">Relationship filters</summary>
          <ServiceRelationshipFilters
            filters={filters}
            protocols={overview.protocols}
            onChange={setFilters}
          />
        </details>
      )}
      <div
        className={
          selectedId || connection
            ? "grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] 2xl:grid-cols-[minmax(0,1fr)_480px]"
            : "min-w-0"
        }
      >
        <div className="min-w-0">
          {mode === "graph" ? (
            <>
              <div hidden={!isOverview}>
                <ServiceOverviewCanvas
                  key={"overview:" + model.id}
                  projection={overview}
                  active={isOverview}
                  selectedId={selectedId}
                  connectionKey={connection?.key ?? null}
                  filters={filters}
                  onFiltersChange={setFilters}
                  highlightIds={highlight?.modelId === model.id ? highlight.ids : []}
                  onClearHighlight={() => setHighlight(null)}
                  onService={(id) => {
                    setConnectionSelection(null);
                    setHighlight(null);
                    handleSelect(id);
                  }}
                  onConnection={(key) => {
                    setConnectionSelection({ modelId: model.id, key });
                    setHighlight(null);
                    setDrilledSourceEdgeId(null);
                    onSelect(null);
                  }}
                  onClear={clearGraphSelection}
                  onDetails={showDetails}
                />
              </div>
              <div hidden={isOverview}>
                <DependencyNetwork
                  key={"details:" + model.id}
                  model={model}
                  active={!isOverview}
                  showPresentationOptions={false}
                  relationshipScopeCount={model.edges.length - scopedModel.edges.length}
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
              </div>
            </>
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
        {connection && !selectedId && (
          <ServiceConnectionPanel
            key={connection.key}
            connection={connection}
            services={overview.services}
            onInspect={(id) => {
              setHighlight(null);
              handleSelect(id);
            }}
            onClose={clearGraphSelection}
            onDetails={() => {
              setHighlight({ modelId: model.id, ids: connection.relationshipIds });
              showDetails();
            }}
          />
        )}
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
