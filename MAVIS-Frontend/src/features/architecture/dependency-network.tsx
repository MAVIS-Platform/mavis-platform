"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Expand, Shrink, Minimize } from "lucide-react";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Pagination, SelectField } from "@/components/shared/forms";
import {
  projectGraphModel,
  filterGraphCategories,
  graphCategories,
  graphCategory,
  type GraphCategory,
} from "./graph-projection";
import cytoscape, { type Core } from "cytoscape";
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
}: {
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
}) {
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

  const [internalHiddenCategories, setInternalHiddenCategories] = useState<GraphCategory[]>([]);
  const hiddenCategories = controlledHiddenCategories ?? internalHiddenCategories;
  const changeHiddenCategories = onHiddenCategoriesChange ?? setInternalHiddenCategories;
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<NetworkMode>("analysis");
  const currentMode = useRef(mode);
  currentMode.current = mode;
  const cameraSnapshots = useRef(new Map<NetworkMode, NetworkSnapshot>());
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const [elementPage, setElementPage] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pulseCanvas = useRef<HTMLCanvasElement>(null);
  const section = useRef<HTMLElement>(null);
  const graph = useRef<Core | null>(null);
  const refreshTheme = useRef<() => void>(() => {});
  const presentMode = useRef<(mode: NetworkMode) => void>(() => {});
  const selection = useRef({ selectedId, onSelect });
  selection.current = { selectedId, onSelect };
  const rightDrag = useRef<{
    id: number;
    button: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const internalProjection = useMemo(
    () => projectGraphModel(model, expanded, origin),
    [model, expanded, origin],
  );
  const baseProjection = controlledProjection ?? internalProjection;
  const projection = useMemo(
    () => ({
      ...baseProjection,
      model: filterGraphCategories(baseProjection.model, hiddenCategories),
    }),
    [baseProjection, hiddenCategories],
  );
  const nodes = projection.model.elements;
  const edges = projection.model.edges;
  const elements = useMemo(() => networkElements(projection.model), [projection.model]);
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
  const pageCount = Math.max(1, Math.ceil(matchingNodes.length / 30), Math.ceil(edges.length / 50));
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
    if (!container) return;
    const positions = networkPositions(
      projection.model,
      container.clientWidth / Math.max(1, container.clientHeight),
    );
    const snapshots = cameraSnapshots.current;
    const saved = snapshots.get(currentMode.current);
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
            "text-background-color": "#0f172a",
            "text-background-opacity": 1,
            "text-background-padding": "3px",
            "overlay-opacity": 0,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "curve-style": "bezier",
            "control-point-step-size": 45,
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "line-style": (edge) => edge.data("lineStyle"),
            "arrow-scale": 0.8,
            opacity: 0.65,
            "overlay-opacity": 0,
          },
        },
        { selector: ".muted", style: { opacity: 0.15 } },
        { selector: "node.focused", style: { "border-width": 4, "font-weight": "bold" } },
        { selector: "edge.focused", style: { width: 3, opacity: 1 } },
        { selector: "node.search-match", style: { "border-width": 4, "font-weight": "bold" } },
        ...exploreStyles,
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
          : `${target.source().data("label")} → ${target.target().data("label")} · ${target.data("label")}`,
      );
    });
    cy.on("mouseout", "node, edge", () => {
      cy.elements().removeClass("hovered hover-neighbor");
      setHovered(null);
    });
    cy.on("tap", "node, edge", (event) => {
      const id = event.target.data("sourceId") as string;
      selection.current.onSelect(selection.current.selectedId === id ? null : id);
    });
    cy.on("tap", (event) => {
      if (event.target === cy) selection.current.onSelect(null);
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
    const resize = new ResizeObserver(() => cy.resize());
    resize.observe(container);
    const updateTheme = () => {
      // Tailwind themes use OKLCH; Cytoscape's colour parser expects RGB/hex.
      const context = document.createElement("canvas").getContext("2d");
      let foreground = "#64748b";
      let labelBackground = "#0f172a";
      if (context) {
        context.fillStyle = getComputedStyle(container).color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        foreground = `rgb(${r}, ${g}, ${b})`;
        context.fillStyle = getComputedStyle(container).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [br, bg, bb] = context.getImageData(0, 0, 1, 1).data;
        labelBackground = `rgb(${br}, ${bg}, ${bb})`;
      }
      cy.style()
        .selector("node:not(.explore)")
        .style({
          color: foreground,
          "border-color": foreground,
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
  }, [elements, nodes.length, projection.model]);

  useEffect(() => {
    presentMode.current(mode);
    refreshTheme.current();
  }, [elements, mode]);

  useEffect(() => {
    const cy = graph.current,
      canvas = pulseCanvas.current;
    if (mode !== "explore" || !selectedId || !cy || !canvas) return;
    return startNetworkPulse(cy, selectedId, canvas);
  }, [elements, mode, selectedId]);

  useEffect(() => {
    const cy = graph.current;
    if (!cy) return;
    const focus = networkFocus(model, projection.model, selectedId, highlightIds);
    const search = query.trim().toLowerCase();
    cy.batch(() => {
      cy.elements().removeClass("muted focused search-match neighbor");
      cy.nodes().forEach((node) => {
        const id = node.data("sourceId") as string;
        const match = !search || String(node.data("name")).toLowerCase().includes(search);
        node.toggleClass("muted", !match || (focus.active && !focus.nodes.has(id)));
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
        edge.toggleClass("muted", focus.active && !focus.edges.has(id));
        edge.toggleClass(
          "focused",
          highlightIds.length > 0
            ? focus.edges.has(id)
            : (mode === "explore" && focus.edges.has(id)) ||
                selectedId === id ||
                underlying.includes(selectedId ?? ""),
        );
      });
    });
  }, [elements, model, projection.model, selectedId, highlightIds, query, mode]);
  return (
    <section
      ref={section}
      className="min-w-0 overflow-hidden rounded-xl border bg-card"
      aria-label="Dependency graph"
    >
      <Tooltip.Provider delayDuration={250}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
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
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Zoom graph in"
                onClick={() => zoom(1.2)}
              >
                +
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="bottom"
              sideOffset={6}
              className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            >
              Zoom in
            </Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Zoom graph out"
                onClick={() => zoom(1 / 1.2)}
              >
                −
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="bottom"
              sideOffset={6}
              className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            >
              Zoom out
            </Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="size-9 shrink-0 rounded-xl p-0"
                aria-label="Fit graph"
                onClick={fitGraph}
              >
                <Shrink className="size-4" aria-hidden="true" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="bottom"
              sideOffset={6}
              className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            >
              Fit graph — show the entire graph
            </Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="size-9 shrink-0 rounded-xl p-0"
                aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                onClick={() => {
                  void (
                    document.fullscreenElement
                      ? document.exitFullscreen()
                      : (
                          section.current?.closest("[data-architecture-workspace]") ??
                          section.current
                        )?.requestFullscreen()
                  )?.catch(() => {});
                }}
              >
                {fullscreen ? (
                  <Minimize className="size-4" aria-hidden="true" />
                ) : (
                  <Expand className="size-4" aria-hidden="true" />
                )}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="bottom"
              sideOffset={6}
              className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            >
              {fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen — expand the workspace"}
            </Tooltip.Content>
          </Tooltip.Root>
          <Popover.Root>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Popover.Trigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="size-9 shrink-0 rounded-xl p-0 text-base font-semibold"
                    aria-label="Graph help"
                  >
                    ?
                  </Button>
                </Popover.Trigger>
              </Tooltip.Trigger>
              <Tooltip.Content
                side="bottom"
                align="end"
                sideOffset={6}
                className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
              >
                Graph guide
              </Tooltip.Content>
            </Tooltip.Root>
            <Popover.Content
              align="end"
              sideOffset={8}
              aria-label="Graph help"
              className="z-50 w-[min(360px,calc(100vw-32px))] rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-xl outline-none"
            >
              <p className="font-semibold">Graph guide</p>
              <dl className="mt-3 space-y-2 text-xs leading-relaxed">
                <div>
                  <dt className="font-medium">Move &amp; zoom</dt>
                  <dd className="text-muted-foreground">
                    Drag a node to move it, or drag the background (or right-click drag) to pan.
                    Scroll, right-click (Shift+right-click to zoom out), or use + / − to zoom. Fit
                    graph restores the overview.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Inspect a connection</dt>
                  <dd className="text-muted-foreground">
                    Hover for details. Select a node or relationship to open the 3E inspector.
                    Select it again or click the background to clear focus.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Keyboard</dt>
                  <dd className="text-muted-foreground">
                    Focus the canvas: arrow keys pan, + / − zoom, Home or 0 fits, and Escape clears
                    selection. Use Graph elements above for keyboard selection.
                  </dd>
                </div>
              </dl>
              <div className="mt-3 border-t pt-3 text-xs leading-relaxed">
                <p className="font-semibold">
                  {mode === "explore" ? "Explore mode" : "Analysis mode"}
                </p>
                {mode === "explore" ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>Node size represents connection count.</li>
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
                    Colors and badges identify element types. Arrows show relationship direction;
                    line styles and origins are explained in the legend below.
                  </p>
                )}
              </div>
              <Popover.Arrow className="fill-popover" />
            </Popover.Content>
          </Popover.Root>
        </div>
      </Tooltip.Provider>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">Source model:</strong> {model.elements.length}{" "}
          elements · {model.edges.length} relationships
        </span>
        <span>
          <strong className="text-foreground">Displayed in view:</strong> {nodes.length} elements ·{" "}
          {edges.length} visible connections
        </span>
        <span>
          <strong className="text-foreground">Filtered by origin:</strong>{" "}
          {projection.filteredRelationships} relationships ({origin})
        </span>
        <span>
          <strong className="text-foreground">Internal:</strong> {projection.internalRelationships}{" "}
          hidden within collapsed containers
        </span>
        {projection.unassignedElements > 0 && (
          <span>
            {projection.unassignedElements} unassigned internal elements and{" "}
            {projection.unassignedRelationships} related connections hidden. Expand service
            internals to inspect; ownership is unknown.
          </span>
        )}
        {hiddenCategories.length > 0 && (
          <span>
            {baseProjection.model.elements.length - nodes.length} elements and{" "}
            {baseProjection.model.edges.length - edges.length} connections hidden by type.
          </span>
        )}
        {query.trim() !== "" && (
          <span>
            <strong className="text-foreground">Search:</strong>{" "}
            {nodes.filter((n) => n.name.toLowerCase().includes(query.trim().toLowerCase())).length}/
            {nodes.length} elements highlighted
          </span>
        )}
        {nodes.length > 300 && (
          <span className="font-medium text-amber-600 dark:text-amber-400">
            (Grid layout mode: &gt;300 elements active, force simulation bypassed for performance)
          </span>
        )}
      </div>
      <details className="border-b p-3 text-sm">
        <summary className="cursor-pointer">Graph elements (keyboard navigation)</summary>
        <div className="mt-3 max-h-64 space-y-2 overflow-auto">
          {matchingNodes.slice((page - 1) * 30, page * 30).map((node) => (
            <button
              key={node.id}
              type="button"
              className="block rounded px-2 py-1 text-left hover:bg-muted focus-visible:outline"
              aria-label={`Select ${node.name}`}
              aria-pressed={selectedId === node.id}
              onClick={() => onSelect(selectedId === node.id ? null : node.id)}
            >
              {node.name} · {node.elementType}
            </button>
          ))}
          {edges.slice((page - 1) * 50, page * 50).map((edge) => (
            <button
              key={edge.id}
              type="button"
              className="block rounded px-2 py-1 text-left hover:bg-muted focus-visible:outline"
              aria-label={`Inspect ${byId.get(edge.from)?.name} to ${byId.get(edge.to)?.name}: ${edge.protocol}`}
              aria-pressed={
                selectedId === edge.id || edge.underlyingEdgeIds?.includes(selectedId ?? "")
              }
              onClick={() => onSelect(selectedId === edge.id ? null : edge.id)}
            >
              {byId.get(edge.from)?.name} → {byId.get(edge.to)?.name} · {edge.protocol}
            </button>
          ))}
        </div>
        {pageCount > 1 && (
          <Pagination page={page} pageCount={pageCount} onPageChange={setElementPage} />
        )}
      </details>
      <details className="border-b p-3 text-sm">
        <summary className="cursor-pointer">Graph options</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
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
      <div className="relative">
        <div
          ref={viewport}
          role="region"
          aria-label="Service dependency network"
          aria-description="Drag nodes or background (or right-click drag to pan). Scroll or right-click to zoom. Use Graph elements above to inspect nodes and relationships with the keyboard."
          tabIndex={0}
          className={`relative h-[620px] touch-none select-none overflow-hidden ${mode === "explore" ? "bg-[#080b16] text-slate-200" : "bg-background text-foreground"}`}
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
                {nodes.length} elements · {edges.length} connections in this view
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
          <span>─── Static</span>
          <span>- - - Declared</span>
          <span>··· Uncertain</span>
        </div>
      </div>
    </section>
  );
}
