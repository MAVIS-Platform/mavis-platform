"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArchitecturalModel } from "@/types/domain";
import { DependencyNetwork } from "./dependency-network";
import { ArchitectureDiagrams } from "./architecture-diagrams";
import { networkConnections } from "./network-connections";
import { ConnectionDetailsPanel } from "./connection-details-panel";
import { InspectorSidebar } from "./inspector-sidebar";
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
  const [connectionSelection, setConnectionSelection] = useState<{
    modelId: string;
    key: string;
  } | null>(null);
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

  const connections = useMemo(
    () => networkConnections(model, projection.model),
    [model, projection.model],
  );
  const connection =
    mode === "graph" && connectionSelection?.modelId === model.id
      ? connections.find((group) => group.key === connectionSelection.key)
      : undefined;
  useEffect(() => {
    if (
      connectionSelection &&
      (connectionSelection.modelId !== model.id ||
        !connections.some((group) => group.key === connectionSelection.key))
    )
      setConnectionSelection(null);
  }, [connectionSelection, connections, model.id]);
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
    const sourceEdge = model.edges.find((edge) => edge.id === id);
    if (
      mode !== "graph" ||
      connection ||
      (sourceEdge && (sourceEdge.underlyingEdgeIds?.length ?? 0) <= 1)
    ) {
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
    if (!selectedId || mode !== "graph" || connection) return undefined;
    const original = model.edges.find((edge) => edge.id === selectedId);
    if (original && (original.underlyingEdgeIds?.length ?? 0) <= 1) return undefined;
    return projection.model.edges.find(
      (e) => e.id === selectedId || e.underlyingEdgeIds?.includes(selectedId),
    );
  }, [model, projection, selectedId, mode, connection]);

  const activeSequenceContext = mode === "diagram" ? sequenceContext : null;
  const workspace = useRef<HTMLDivElement>(null);
  const dockOpen = mode === "graph" && Boolean(selectedId || connection);
  const [workspaceHeight, setWorkspaceHeight] = useState(700);
  useEffect(() => {
    if (!dockOpen) return;
    const update = () =>
      setWorkspaceHeight(
        Math.max(
          540,
          window.innerHeight -
            Math.max(0, workspace.current?.getBoundingClientRect().top ?? 0) -
            16,
        ),
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [dockOpen]);
  const closeInspector = () => {
    setHighlight(null);
    setDrilledSourceEdgeId(null);
    setSequenceContext(null);
    setConnectionSelection(null);
    onSelect(null);
    requestAnimationFrame(() =>
      workspace.current
        ?.querySelector<HTMLElement>('[data-renderer="cytoscape"]')
        ?.focus({ preventScroll: true }),
    );
  };

  return (
    <div
      data-architecture-workspace
      onKeyDown={(event) => {
        if (mode === "graph" && event.key === "Escape" && !event.defaultPrevented) {
          closeInspector();
        }
      }}
      className="space-y-2.5 [&:fullscreen]:m-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-4"
    >
      <div
        ref={workspace}
        style={dockOpen ? { height: workspaceHeight } : undefined}
        className={
          dockOpen
            ? "relative flex min-w-0 flex-row gap-2"
            : selectedId || connection
              ? "grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] 2xl:grid-cols-[minmax(0,1fr)_480px]"
              : "min-w-0"
        }
      >
        <div className={dockOpen ? "min-h-0 min-w-0 flex-1 overflow-hidden" : "min-w-0"}>
          {mode === "graph" ? (
            <DependencyNetwork
              key={model.id}
              fillHeight={dockOpen}
              model={model}
              selectedId={activeRelationshipId}
              onSelect={(id) => {
                setConnectionSelection(null);
                handleSelect(id);
              }}
              connections={connections}
              selectedConnectionKey={connection?.key ?? null}
              onConnectionSelect={(key) => {
                setConnectionSelection({ modelId: model.id, key });
                setHighlight(null);
                setDrilledSourceEdgeId(null);
                onSelect(null);
              }}
              onClearConnection={() => {
                setConnectionSelection(null);
                handleSelect(null);
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
        <InspectorPanelWrapper
          docked={dockOpen}
          onClose={closeInspector}
          label={connection && !selectedId ? "Connection details" : "Architecture Inspector · 3E"}
        >
          {connection && !selectedId && (
            <ConnectionDetailsPanel
              key={connection.key}
              docked={mode === "graph"}
              connection={connection}
              elements={projection.model.elements}
              model={model}
              projectId={model.projectId}
              onInspect={(id) => {
                setDrilledSourceEdgeId(null);
                onSelect(id);
              }}
              onClose={() => {
                setConnectionSelection(null);
                handleSelect(null);
              }}
            />
          )}
          {selectedId && (
            <SelectionThreeE
              docked={mode === "graph"}
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
        </InspectorPanelWrapper>
      </div>
    </div>
  );
}

function InspectorPanelWrapper({
  docked,
  children,
  onClose,
  label,
}: {
  docked: boolean;
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}) {
  return docked ? (
    <InspectorSidebar onClose={onClose} label={label}>
      {children}
    </InspectorSidebar>
  ) : (
    <>{children}</>
  );
}
