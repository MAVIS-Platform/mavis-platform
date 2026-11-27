"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { DiagramViewportToolbar } from "./diagram-viewport-toolbar";
import { Pagination, SelectField } from "@/components/shared/forms";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  projectGraphModel,
  filterGraphCategories,
  graphCategories,
  graphCategory,
  type GraphCategory,
} from "./graph-projection";
import cytoscape, { type Core } from "cytoscape";
import { networkConnections, type NetworkConnection } from "./network-connections";
import { networkElements, networkFocus } from "./cytoscape-network";
import { networkPositions } from "./network-layout";
import { startNetworkPulse } from "./network-pulse";
import { exploreAppearance, exploreClusters } from "./explore-layout";
import {
  createNetworkPresentation,
  captureNetworkSnapshot,
  exploreStyles,
  type NetworkMode,
  type NetworkSnapshot,
} from "./network-presentation";

function isDarkThemeActive(): boolean {
  return (
    typeof document !== "undefined" &&
    Boolean(
      document.documentElement?.classList?.contains("dark") ||
        document.documentElement?.dataset?.["theme"] === "dark",
    )
  );
}

export function DependencyNetwork({
  model,
  selectedId,
  onSelect,
  highlightIds = [],
  onClearHighlight,
  expanded: controlledExpanded,
  onToggleExpanded,
  origin: controlledOrigin,
  onOriginChange,
  projection: controlledProjection,
  hiddenCategories: controlledHiddenCategories,
  onHiddenCategoriesChange,
  active = true,
  fillHeight = false,
  guidedStatic = false,
  showPresentationOptions = true,
  relationshipScopeCount = 0,
  connections: controlledConnections,
  selectedConnectionKey = null,
  onConnectionSelect,
  onClearConnection,
  lensFocusActive = false,
  lensFocusNodeIds,
  lensFocusEdgeIds,
}: {
  connections?: NetworkConnection[];
  selectedConnectionKey?: string | null;
  onConnectionSelect?: (key: string) => void;
  onClearConnection?: () => void;
  active?: boolean;
  fillHeight?: boolean;
  guidedStatic?: boolean;
  showPresentationOptions?: boolean;
  relationshipScopeCount?: number;
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  highlightIds?: string[];
  onClearHighlight?: () => void;
  expanded?: boolean | undefined;
  onToggleExpanded?: (() => void) | undefined;
  origin?: ("all" | "source" | "deployment" | "runtime") | undefined;
  onOriginChange?: ((origin: "all" | "source" | "deployment" | "runtime") => void) | undefined;
  projection?: ReturnType<typeof projectGraphModel> | undefined;
  hiddenCategories?: GraphCategory[];
  onHiddenCategoriesChange?: (hidden: GraphCategory[]) => void;
  lensFocusActive?: boolean | undefined;
  lensFocusNodeIds?: ReadonlyArray<string> | undefined;
  lensFocusEdgeIds?: ReadonlyArray<string> | undefined;
}) {
  const fillHeightRef = useRef(fillHeight);
  fillHeightRef.current = fillHeight;
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const toggleExpanded = onToggleExpanded ?? (() => setInternalExpanded((v) => !v));

  const [internalOrigin, setInternalOrigin] = useState<"all" | "source" | "deployment" | "runtime">(
    "all",
  );
  const origin = controlledOrigin ?? internalOrigin;
  const changeOrigin = (v: typeof origin) => {
    if (onOriginChange) onOriginChange(v);
    else setInternalOrigin(v);
  };

  const runtimeEdgeCount = useMemo(
    () =>
      model.edges.filter(
        (e) =>
          e.originLayer === "RUNTIME" ||
          e.originLayer === "STATIC_AND_RUNTIME" ||
          e.protocol.includes("RUNTIME"),
      ).length,
    [model.edges],
  );

  const [internalHiddenCategories, setInternalHiddenCategories] = useState<GraphCategory[]>(() =>
    guidedStatic ? ["database", "messaging", "component", "external", "unknown"] : [],
  );
  const hiddenCategories = controlledHiddenCategories ?? internalHiddenCategories;
  const changeHiddenCategories = onHiddenCategoriesChange ?? setInternalHiddenCategories;
  const [query, setQuery] = useState("");
  const [dockToolsOpen, setDockToolsOpen] = useState(false);
  const [mode, setMode] = useState<NetworkMode>("analysis");
  const currentMode = useRef(mode);
  currentMode.current = mode;
  const cameraSnapshots = useRef(new Map<NetworkMode, NetworkSnapshot>());
  const [fullscreen, setFullscreen] = useState(false);
  const [overlayFullscreen, setOverlayFullscreen] = useState(false);
  const isFullscreenView = fullscreen || overlayFullscreen;
  useEffect(() => {
    const update = () => {
      const target =
        section.current?.closest("[data-architecture-workspace]") ?? section.current;
      setFullscreen(Boolean(document.fullscreenElement && target && document.fullscreenElement === target));
      requestAnimationFrame(() => {
        graph.current?.resize();
        graph.current?.fit(undefined, 28);
      });
    };
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    if (!overlayFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOverlayFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [overlayFullscreen]);
  useEffect(() => {
    if (!overlayFullscreen) return;
    requestAnimationFrame(() => {
      graph.current?.resize();
      graph.current?.fit(undefined, 28);
    });
  }, [overlayFullscreen]);
  const { t } = useLocale();
  const [elementPage, setElementPage] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pulseCanvas = useRef<HTMLCanvasElement>(null);
  const section = useRef<HTMLElement>(null);
  const graph = useRef<Core | null>(null);
  const refreshTheme = useRef<() => void>(() => {});
  const presentMode = useRef<(mode: NetworkMode) => void>(() => {});
  const selection = useRef({
    selectedId,
    onSelect,
    onConnectionSelect,
    onClearConnection,
    selectedConnectionKey,
  });
  selection.current = {
    selectedId,
    onSelect,
    onConnectionSelect,
    onClearConnection,
    selectedConnectionKey,
  };
  const rightDrag = useRef<{
    id: number;
    button: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const baseProjection = useMemo(
    () => controlledProjection ?? projectGraphModel(model, expanded, origin),
    [controlledProjection, model, expanded, origin],
  );
  const projection = useMemo(
    () => ({
      ...baseProjection,
      model: filterGraphCategories(baseProjection.model, hiddenCategories),
    }),
    [baseProjection, hiddenCategories],
  );
  const nodes = projection.model.elements;
  const edges = projection.model.edges;
  const connections = useMemo(
    () => controlledConnections ?? networkConnections(model, projection.model),
    [controlledConnections, model, projection.model],
  );
  const elements = useMemo(
    () => networkElements(projection.model, null, guidedStatic ? undefined : connections),
    [connections, guidedStatic, projection.model],
  );
  function inspectConnection(connection: NetworkConnection) {
    if (onConnectionSelect) onConnectionSelect(connection.key);
    else {
      const original = connection.relationships.find((row) => row.metadataAvailable);
      if (original) onSelect(original.id);
    }
  }

  const clusterLegend = useMemo(() => {
    const { seeds } = exploreClusters(projection.model);
    const appearance = exploreAppearance(projection.model);
    return seeds.map((seed) => ({
      id: seed.id,
      name: seed.name,
      color: appearance.get(seed.id)!.color,
    }));
  }, [projection.model]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const search = query.trim().toLowerCase();
  const matchingNodes = nodes.filter((node) => !search || node.name.toLowerCase().includes(search));
  const pageCount = Math.max(
    1,
    Math.ceil(matchingNodes.length / 30),
    Math.ceil(connections.length / 50),
  );
  const page = Math.min(elementPage, pageCount);

  function zoom(factor: number) {
    const cy = graph.current;
    if (!cy) return;
    cy.zoom({
      level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }
  function fitGraph() {
    graph.current?.fit(undefined, 28);
  }

  useEffect(() => {
    const container = viewport.current;
    if (!container || !active) return;
    const snapshots = cameraSnapshots.current;
    const saved = snapshots.get(currentMode.current);
    const needsPositions = nodes.some((node) => !saved?.positions.has(`node:${node.id}`));
    const positions = needsPositions
      ? networkPositions(
          projection.model,
          container.clientWidth / Math.max(1, container.clientHeight),
        )
      : new Map<string, { x: number; y: number }>();
    const cy = cytoscape({
      container,
      elements: elements.map((element) =>
        element.group === "nodes"
          ? {
              ...element,
              position:
                saved?.positions.get(element.data["id"] ?? "") ??
                positions.get(element.data["sourceId"])!,
            }
          : element,
      ),
      minZoom: 0.05,
      maxZoom: 5,
      userZoomingEnabled: false,
      selectionType: "single",
      autounselectify: true,
      boxSelectionEnabled: false,
      layout:
        !saved && nodes.length > 300
          ? {
              name: "grid",
              padding: 48,
              avoidOverlap: true,
              nodeDimensionsIncludeLabels: true,
              spacingFactor: 1.3,
            }
          : {
              name: "preset",
              padding: 28,
              fit: !saved,
            },
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            width: "data(size)",
            height: "data(size)",
            "background-color": "data(color)",
            "border-width": 2,
            "font-size": 11,
            "font-family": "monospace",
            "text-valign": "bottom",
            "text-margin-y": 9,
            "text-wrap": "ellipsis",
            "text-max-width": "168px",
            color: isDarkThemeActive() ? "#e2e8f0" : "#0f172a",
            "text-background-color": isDarkThemeActive() ? "#0f172a" : "#ffffff",
            "text-background-opacity": 1,
            "text-background-padding": "3px",
            "overlay-opacity": 0,
          },
        },
        {
          selector: "edge",
          style: {
            width: guidedStatic ? 1.8 : 1.5,
            "curve-style": (edge) =>
              guidedStatic || edge.data("source") === edge.data("target") ? "bezier" : "straight",
            "control-point-step-size": 45,
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": guidedStatic ? "triangle" : "none",
            "source-arrow-shape": "none",
            "line-style": "solid",
            "arrow-scale": guidedStatic ? 0.9 : 0.8,
            opacity: guidedStatic ? 0.8 : 0.65,
            "overlay-opacity": 0,
          },
        },
        {
          selector: "edge.runtime-verified",
          style: {
            width: 3,
            opacity: 0.95,
            "line-color": "#10b981",
            "target-arrow-color": "#10b981",
            "target-arrow-shape": "triangle",
            "arrow-scale": 1.1,
          },
        },
        { selector: ".muted", style: { opacity: 0.15 } },
        { selector: ".lens-muted", style: { opacity: 0.28 } },
        { selector: "node.lens-focused", style: { "border-width": 3, "border-color": "#0284c7", "font-weight": "bold" } },
        { selector: "edge.lens-focused", style: { width: 2.5, opacity: 1 } },
        { selector: "node.focused", style: { "border-width": 4, "font-weight": "bold" } },
        { selector: "edge.focused", style: { width: 3, opacity: 1 } },
        { selector: "node.search-match", style: { "border-width": 4, "font-weight": "bold" } },
        ...exploreStyles,
        ...(guidedStatic
          ? [
              {
                selector:
                  "edge.directed-static, edge.directed-static.explore, edge.directed-static.explore.focused, edge.directed-static.explore.hover-neighbor",
                style: {
                  "curve-style": "bezier" as const,
                  "target-arrow-shape": "triangle" as const,
                  "arrow-scale": 0.9,
                  "target-arrow-color": "data(color)",
                  label: "data(shortLabel)",
                  "font-size": "9px",
                  color: "#334155",
                  "text-background-color": "#ffffff",
                  "text-background-opacity": 0.9,
                  "text-background-padding": "2px",
                },
              },
            ]
          : []),
      ],
    });
    if (saved) {
      cy.zoom(saved.zoom);
      cy.pan(saved.pan);
    }
    graph.current = cy;
    presentMode.current = createNetworkPresentation(
      cy,
      projection.model,
      snapshots,
      currentMode.current,
    );
    setHovered(null);
    cy.on("mouseover", "node, edge", (event) => {
      const target = event.target;
      target.addClass("hovered");
      if (target.isNode()) target.closedNeighborhood().addClass("hover-neighbor");
      else target.addClass("hover-neighbor");
      setHovered(
        target.isNode()
          ? `${target.data("label")} · ${target.data("elementType") ?? "Element"} · ${target.degree()} connections`
          : `${target.source().data("label")} ${target.data("connectionKey") ? "—" : "→"} ${target.target().data("label")} · ${target.data("label")}`,
      );
    });
    cy.on("mouseout", "node, edge", () => {
      cy.elements().removeClass("hovered hover-neighbor");
      setHovered(null);
    });
    cy.on("tap", "node, edge", (event) => {
      const target = event.target;
      if (
        target.isEdge() &&
        selection.current.onConnectionSelect &&
        target.data("connectionKey")
      ) {
        const key = String(target.data("connectionKey"));
        if (selection.current.selectedConnectionKey === key)
          selection.current.onClearConnection?.();
        else selection.current.onConnectionSelect(key);
      } else {
        const id = target.isNode()
          ? String(target.data("sourceId"))
          : (target.data("underlyingEdgeIds") as string[])[0];
        if (id) selection.current.onSelect(selection.current.selectedId === id ? null : id);
      }
    });
    cy.on("tap", (event) => {
      if (event.target === cy) {
        selection.current.onClearConnection?.();
        selection.current.onSelect(null);
      }
    });
    let detailShown: boolean | null = null;
    const updateCamera = () => {
      const pan = cy.pan();
      const z = cy.zoom();
      container.dataset["zoom"] = String(z);
      container.dataset["panX"] = String(pan.x);
      container.dataset["panY"] = String(pan.y);
      const nextDetail = z >= 1.1;
      if (nextDetail !== detailShown) {
        detailShown = nextDetail;
        cy.nodes().toggleClass("detail", nextDetail);
      }
    };
    cy.on("zoom pan", updateCamera);
    updateCamera();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 620 : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      const factor = Math.exp(-delta * 0.0025);
      cy.zoom({
        level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
        renderedPosition: {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    const resize = new ResizeObserver(() => {
      cy.resize();
      if (fillHeightRef.current && cy.width() > 0 && cy.height() > 0) cy.fit(cy.elements(), 20);
    });
    resize.observe(container);
    const updateTheme = () => {
      // Tailwind themes use OKLCH; Cytoscape's colour parser expects explicit RGB/hex.
      const isDarkTheme = isDarkThemeActive();
      const foreground = isDarkTheme ? "#e2e8f0" : "#0f172a";
      const labelBackground = isDarkTheme ? "#0f172a" : "#ffffff";
      cy.style()
        .selector("node, node.analysis")
        .style({
          color: foreground,
          "border-color": foreground,
          "text-background-color": labelBackground,
        })
        .selector("edge.directed-static")
        .style({
          color: isDarkTheme ? "#cbd5e1" : "#334155",
          "text-background-color": labelBackground,
        })
        .update();
    };
    refreshTheme.current = updateTheme;
    updateTheme();
    const theme = new MutationObserver(updateTheme);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => {
      container.removeEventListener("wheel", onWheel);
      resize.disconnect();
      theme.disconnect();
      snapshots.set(
        currentMode.current,
        captureNetworkSnapshot(cy, snapshots.get(currentMode.current)),
      );
      cy.destroy();
      graph.current = null;
      refreshTheme.current = () => {};
      presentMode.current = () => {};
    };
  }, [active, elements, guidedStatic, nodes, projection.model]);

  useEffect(() => {
    if (!fillHeight) return;
    let fitFrame = 0;
    const frame = requestAnimationFrame(() => {
      fitFrame = requestAnimationFrame(() => {
        const cy = graph.current;
        if (cy) {
          cy.resize();
          cy.fit(cy.elements(), 32);
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(fitFrame);
    };
  }, [fillHeight]);

  useEffect(() => {
    presentMode.current(mode);
    refreshTheme.current();
  }, [active, elements, mode]);

  useEffect(() => {
    const cy = graph.current,
      canvas = pulseCanvas.current;
    if (mode !== "explore" || !selectedId || !cy || !canvas) return;
    return startNetworkPulse(cy, selectedId, canvas);
  }, [active, elements, mode, selectedId]);

  useEffect(() => {
    const cy = graph.current;
    if (!cy) return;
    const focus = networkFocus(model, projection.model, selectedId, highlightIds);
    const selectedConnection = connections.find(
      (connection) => connection.key === selectedConnectionKey,
    );
    if (selectedConnection && !selectedId && !highlightIds.length) {
      focus.active = true;
      selectedConnection.elementIds.forEach((id) => focus.nodes.add(id));
      selectedConnection.projectedEdgeIds.forEach((id) => focus.edges.add(id));
    }
    const search = query.trim().toLowerCase();
    const lensNodeSet = new Set(lensFocusNodeIds ?? []);
    const lensEdgeSet = new Set(lensFocusEdgeIds ?? []);
    const applyLens = Boolean(
      lensFocusActive &&
        !focus.active &&
        highlightIds.length === 0 &&
        !selectedId &&
        (lensNodeSet.size > 0 || lensEdgeSet.size > 0),
    );
    cy.batch(() => {
      cy.elements().removeClass("muted focused search-match neighbor lens-muted lens-focused");
      cy.nodes().forEach((node) => {
        const id = node.data("sourceId") as string;
        const match = !search || String(node.data("name")).toLowerCase().includes(search);
        const orphanInRuntime = origin === "runtime" && edges.length > 0 && node.degree() === 0;
        const inLensNode = lensNodeSet.size === 0 || lensNodeSet.has(id);
        node.toggleClass(
          "muted",
          !match || orphanInRuntime || (focus.active && !focus.nodes.has(id)),
        );
        node.toggleClass("lens-muted", applyLens && !inLensNode && match && !orphanInRuntime);
        node.toggleClass("lens-focused", applyLens && inLensNode && match && !orphanInRuntime);
        node.toggleClass(
          "focused",
          selectedId === id || (highlightIds.length > 0 && focus.nodes.has(id)),
        );
        node.toggleClass("search-match", !!search && match);
        node.toggleClass("neighbor", focus.active && focus.nodes.has(id));
      });
      cy.edges().forEach((edge) => {
        const id = edge.data("sourceId") as string;
        const underlying = edge.data("underlyingEdgeIds") as string[];
        const projectedIds = edge.data("projectedEdgeIds") as string[] | undefined;
        const inFocus =
          focus.edges.has(id) || (projectedIds ?? []).some((member) => focus.edges.has(member));
        const edgeSrcId = String(edge.data("source") ?? "").replace(/^node:/, "");
        const edgeDstId = String(edge.data("target") ?? "").replace(/^node:/, "");
        const inLensEdge =
          lensEdgeSet.has(id) ||
          (underlying ?? []).some((member) => lensEdgeSet.has(member)) ||
          (projectedIds ?? []).some((member) => lensEdgeSet.has(member)) ||
          (lensNodeSet.size > 0 && lensNodeSet.has(edgeSrcId) && lensNodeSet.has(edgeDstId));
        edge.toggleClass("muted", focus.active && !inFocus);
        edge.toggleClass("lens-muted", applyLens && !inLensEdge && !focus.active);
        edge.toggleClass("lens-focused", applyLens && inLensEdge && !focus.active);
        edge.toggleClass(
          "focused",
          highlightIds.length > 0
            ? inFocus
            : (mode === "explore" && inFocus) ||
                selectedConnectionKey === edge.id() ||
                selectedId === id ||
                underlying.includes(selectedId ?? ""),
        );
      });
    });
  }, [
    active,
    elements,
    model,
    projection.model,
    selectedId,
    selectedConnectionKey,
    connections,
    highlightIds,
    query,
    mode,
    origin,
    edges.length,
    lensFocusActive,
    lensFocusNodeIds,
    lensFocusEdgeIds,
  ]);
  return (
    <section
      ref={section}
      className={
        overlayFullscreen
          ? "fixed inset-0 z-[120] flex h-screen w-screen flex-col overflow-hidden bg-background"
          : fillHeight || fullscreen
            ? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card [&>details]:shrink-0 [&>details]:max-h-40 [&>details]:overflow-y-auto"
            : "min-w-0 overflow-hidden rounded-xl border bg-card"
      }
      aria-label="Dependency graph"
    >
        <div data-tour="graph-controls" className="flex flex-wrap items-center gap-2 border-b p-3">
          {showPresentationOptions && (
            <div
              role="group"
              aria-label="Graph presentation"
              className="flex gap-1 rounded-lg border p-1"
            >
              <Button
                size="sm"
                variant={mode === "analysis" ? "secondary" : "ghost"}
                aria-pressed={mode === "analysis"}
                onClick={() => setMode("analysis")}
              >
                Analysis
              </Button>
              <Button
                size="sm"
                variant={mode === "explore" ? "secondary" : "ghost"}
                aria-pressed={mode === "explore"}
                onClick={() => setMode("explore")}
              >
                ✦ Explore
              </Button>
            </div>
          )}
          <label className="mr-auto text-sm">
            <span className="sr-only">Search graph</span>
            <input
              aria-label="Search graph"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setElementPage(1);
              }}
              className="h-9 w-52 rounded-md border bg-background px-3"
              placeholder="Search service…"
            />
          </label>
          {highlightIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={onClearHighlight}>
              Return to selection
            </Button>
          )}
          <DiagramViewportToolbar
            onZoomIn={() => zoom(1.2)}
            onZoomOut={() => zoom(1 / 1.2)}
            onFit={fitGraph}
            fullscreen={isFullscreenView}
            zoomInAriaLabel="Zoom graph in"
            zoomOutAriaLabel="Zoom graph out"
            fitAriaLabel="Fit graph"
            helpAriaLabel="Graph help"
            helpTourTrigger="graph-help"
            onToggleFullscreen={() => setOverlayFullscreen((prev) => !prev)}
            guideFooter={
              <div className="mt-3 border-t pt-3 text-xs leading-relaxed">
                <p className="font-semibold">
                  {mode === "explore" ? "Explore mode" : "Analysis mode"}
                </p>
                {mode === "explore" ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>
                      Node size reflects relationship connectivity before line grouping, not
                      traffic.
                    </li>
                    <li>
                      Color groups connected service clusters; gray means unclassified or
                      unconnected. Grouping does not establish ownership.
                    </li>
                    <li>
                      Hover, select, search or zoom in to reveal labels. Hover or select to reveal
                      direction arrows.
                    </li>
                    <li>
                      Select a node to light up its connections. This pulse is a selection effect,
                      not live traffic.
                    </li>
                  </ul>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    Colors and badges identify element types. A plain line groups recorded
                    relationships; select a line for its original directions, types, sources and
                    evidence.
                  </p>
                )}
              </div>
            }
          />
          {fillHeight && (
            <Button
              size="sm"
              variant="outline"
              aria-pressed={dockToolsOpen}
              onClick={() => setDockToolsOpen(!dockToolsOpen)}
            >
              Graph controls
            </Button>
          )}
        </div>
      {runtimeEdgeCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-600/30 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400" />
            <span className="font-semibold">Runtime-Enriched Model Active:</span>
            <span className="font-bold">{runtimeEdgeCount}</span>
            <span>
              relationships verified via OpenTelemetry traces are highlighted in solid emerald green
              on the graph. Click any green edge to inspect its runtime trace evidence.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={origin === "all" ? "secondary" : "outline"}
              className="h-7 px-2.5 text-[11px]"
              onClick={() => changeOrigin("all")}
            >
              {`All Relationships (${model.edges.length})`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={origin === "runtime" ? "default" : "outline"}
              className="h-7 border-emerald-600/40 px-2.5 text-[11px] text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-950"
              onClick={() => changeOrigin(origin === "runtime" ? "all" : "runtime")}
            >
              ⚡{" "}
              {origin === "runtime"
                ? "Showing Only Runtime Calls"
                : `Filter Runtime Calls Only (${runtimeEdgeCount})`}
            </Button>
          </div>
        </div>
      )}
      {(relationshipScopeCount > 0 ||
        projection.unassignedElements > 0 ||
        hiddenCategories.length > 0 ||
        query.trim() !== "" ||
        nodes.length > 300) && (
        <div
          hidden={fillHeight && !dockToolsOpen}
          className={`${fillHeight && !dockToolsOpen ? "!hidden" : ""} flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground`}
        >
          {relationshipScopeCount > 0 && (
            <span>
              {t(
                `${relationshipScopeCount} relationships hidden by type/uncertainty filters.`,
                `Đang ẩn ${relationshipScopeCount} kết nối theo bộ lọc loại/độ tin cậy.`,
              )}
            </span>
          )}
          {projection.unassignedElements > 0 && (
            <span>
              {t(
                `${projection.unassignedElements} unassigned internal elements and ${projection.unassignedRelationships} related connections hidden. Expand service internals to inspect; ownership is unknown.`,
                `Đang ẩn ${projection.unassignedElements} phần tử nội bộ chưa gán và ${projection.unassignedRelationships} kết nối liên quan. Hãy mở chi tiết nội bộ Service để kiểm tra.`,
              )}
            </span>
          )}
          {hiddenCategories.length > 0 && (
            <span>
              {t(
                `${baseProjection.model.elements.length - nodes.length} elements and ${baseProjection.model.edges.length - edges.length} connections hidden by type.`,
                `Đang ẩn ${baseProjection.model.elements.length - nodes.length} thành phần và ${baseProjection.model.edges.length - edges.length} kết nối theo loại phân tầng.`,
              )}
            </span>
          )}
          {query.trim() !== "" && (
            <span>
              <strong className="text-foreground">{t("Search:", "Tìm kiếm:")}</strong>{" "}
              {
                nodes.filter((n) => n.name.toLowerCase().includes(query.trim().toLowerCase()))
                  .length
              }
              /{nodes.length} {t("elements highlighted", "thành phần khớp")}
            </span>
          )}
          {nodes.length > 300 && (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              (Grid layout mode: &gt;300 elements active, force simulation bypassed for performance)
            </span>
          )}
        </div>
      )}
      {!guidedStatic && (
        <>
          <details hidden={fillHeight && !dockToolsOpen} className="border-b p-3 text-sm">
            <summary className="cursor-pointer">Graph elements (keyboard navigation)</summary>
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {matchingNodes.slice((page - 1) * 30, page * 30).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  data-no-translate="true"
                  className="block rounded px-2 py-1 text-left hover:bg-muted focus-visible:outline"
                  aria-label={`Select ${node.name}`}
                  aria-pressed={selectedId === node.id}
                  onClick={() => onSelect(selectedId === node.id ? null : node.id)}
                >
                  {node.name} · {node.elementType}
                </button>
              ))}
              {connections.slice((page - 1) * 50, page * 50).map((connection) => (
                <button
                  key={connection.key}
                  type="button"
                  className="block rounded px-2 py-1 text-left hover:bg-muted focus-visible:outline"
                  aria-label={`Inspect connection ${byId.get(connection.elementIds[0])?.name} and ${byId.get(connection.elementIds[1])?.name}`}
                  aria-pressed={
                    selectedConnectionKey === connection.key ||
                    connection.relationshipIds.includes(selectedId ?? "")
                  }
                  onClick={() => inspectConnection(connection)}
                >
                  {byId.get(connection.elementIds[0])?.name} —{" "}
                  {byId.get(connection.elementIds[1])?.name} · {connection.relationshipIds.length}{" "}
                  relationship(s)
                </button>
              ))}
            </div>
            {pageCount > 1 && (
              <Pagination page={page} pageCount={pageCount} onPageChange={setElementPage} />
            )}
          </details>
          <details hidden={fillHeight && !dockToolsOpen} className="border-b p-3 text-sm">
            <summary className="cursor-pointer">Graph options</summary>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {showPresentationOptions && (
                <SelectField
                  label="Relationship origin"
                  value={origin}
                  onChange={(v) => {
                    changeOrigin(v as typeof origin);
                  }}
                  options={[
                    { value: "all", label: "All relationships" },
                    { value: "source", label: "Source and configuration" },
                    { value: "deployment", label: "Deployment dependencies" },
                    { value: "runtime", label: "Runtime observations" },
                  ]}
                />
              )}
              <Button
                variant="outline"
                onClick={() => {
                  toggleExpanded();
                }}
              >
                {expanded ? "Collapse service internals" : "Expand service internals"}
              </Button>
            </div>
          </details>
        </>
      )}
      <div className={fillHeight || isFullscreenView ? "relative min-h-24 flex-1" : "relative"}>
        <div
          ref={viewport}
          role="region"
          aria-label="Service dependency network"
          aria-description="Drag nodes or background (or right-click drag to pan). Scroll or right-click to zoom. Use Graph elements above to inspect nodes and relationships with the keyboard."
          tabIndex={0}
          className={`relative ${fillHeight || isFullscreenView ? "h-full min-h-24" : "h-[620px]"} touch-none select-none overflow-hidden ${mode === "explore" ? "bg-[#080b16] text-slate-200" : "bg-background text-foreground"}`}
          data-tour="graph-canvas"
          data-renderer="cytoscape"
          data-mode={mode}
          data-zoom="1"
          data-pan-x="0"
          data-pan-y="0"
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onPointerDown={(event) => {
            if (event.button !== 1 && event.button !== 2) return;
            event.preventDefault();
            rightDrag.current = {
              id: event.pointerId,
              button: event.button,
              startX: event.clientX,
              startY: event.clientY,
              x: event.clientX,
              y: event.clientY,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = rightDrag.current;
            if (!drag || drag.id !== event.pointerId) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (
              !drag.moved &&
              Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4
            ) {
              return;
            }
            drag.moved = true;
            drag.x = event.clientX;
            drag.y = event.clientY;
            graph.current?.panBy({ x: dx, y: dy });
          }}
          onPointerUp={(event) => {
            const drag = rightDrag.current;
            if (!drag || drag.id !== event.pointerId) return;
            rightDrag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (!drag.moved && drag.button === 2 && graph.current) {
              const cy = graph.current;
              const rect = event.currentTarget.getBoundingClientRect();
              const factor = event.shiftKey ? 1 / 1.25 : 1.25;
              cy.zoom({
                level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
                renderedPosition: {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                },
              });
            }
          }}
          onPointerCancel={(event) => {
            if (rightDrag.current?.id === event.pointerId) {
              rightDrag.current = null;
            }
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const deltas: Record<string, { x: number; y: number }> = {
              ArrowLeft: { x: -40, y: 0 },
              ArrowRight: { x: 40, y: 0 },
              ArrowUp: { x: 0, y: -40 },
              ArrowDown: { x: 0, y: 40 },
            };
            const delta = deltas[event.key];
            if (delta) {
              event.preventDefault();
              graph.current?.panBy(delta);
            } else if (["+", "=", "-", "0", "Home", "Escape"].includes(event.key)) {
              event.preventDefault();
              if (event.key === "Escape") onSelect(null);
              else if (event.key === "0" || event.key === "Home") fitGraph();
              else zoom(event.key === "-" ? 1 / 1.2 : 1.2);
            }
          }}
        />
        <canvas
          ref={pulseCanvas}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {mode === "explore" && (
          <div className="pointer-events-none absolute left-5 right-5 top-5 flex flex-wrap items-start justify-between gap-3 text-slate-200">
            <div>
              <p className="text-base font-semibold tracking-wide">Architecture Atlas</p>
              <p className="mt-1 text-xs text-slate-400">
                {nodes.length} elements · {connections.length} connections in this view
              </p>
            </div>
          </div>
        )}
        {hovered && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-3 left-3 right-3 w-fit max-w-[calc(100%-24px)] break-words rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm"
          >
            {hovered}
          </div>
        )}
        {!nodes.length && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No elements available for this filter.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
        {mode === "explore" && (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
            aria-label="Explore cluster legend"
          >
            {clusterLegend.map((cluster) => (
              <span key={cluster.id} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: cluster.color }}
                />
                {cluster.name}
              </span>
            ))}
          </div>
        )}
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label="Visible element types"
        >
          {graphCategories
            .filter(
              (category) =>
                category.id !== "unknown" ||
                baseProjection.model.elements.some(
                  (node) => graphCategory(node.elementType) === "unknown",
                ),
            )
            .map((category) => {
              const visible = !hiddenCategories.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={visible}
                  title={`${visible ? "Hide" : "Show"} ${category.label}`}
                  onClick={() => {
                    setElementPage(1);
                    changeHiddenCategories(
                      hiddenCategories.includes(category.id)
                        ? hiddenCategories.filter((id) => id !== category.id)
                        : [...hiddenCategories, category.id],
                    );
                  }}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${visible ? "border-transparent text-foreground" : "border-border text-muted-foreground line-through opacity-60"}`}
                >
                  <span
                    style={{ background: category.color }}
                    className="inline-block size-2.5 rounded-full"
                  />
                  {category.label}
                </button>
              );
            })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
          <span>
            {guidedStatic
              ? "Directed arrows & protocol labels · click a node or edge for 3E evidence"
              : "One plain line per pair · select for direction, source & evidence"}
          </span>
        </div>
      </div>
    </section>
  );
}
