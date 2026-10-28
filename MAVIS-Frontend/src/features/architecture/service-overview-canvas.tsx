"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type StylesheetStyle } from "cytoscape";
import { Button } from "@/components/ui/button";
import { serviceOverviewPositions, SERVICE_WIDTH, SERVICE_HEIGHT } from "./service-overview-layout";
import { ServiceRelationshipFilters } from "./service-relationship-filters";
import { captureNetworkSnapshot, type NetworkSnapshot } from "./network-presentation";
import {
  overviewFocus,
  serviceName,
  type OverviewFilters,
  type ServiceOverviewProjection,
} from "./service-overview";

function shortLabel(name: string) {
  if (name.length <= 26) return name;
  const head = name.slice(0, 26);
  const separator = Math.max(head.lastIndexOf("-"), head.lastIndexOf("_"), head.lastIndexOf(" "));
  const cut = separator >= 10 ? separator + 1 : 26;
  const tail = name.slice(cut).trimStart();
  return name.slice(0, cut).trimEnd() + "\n" + (tail.length > 26 ? tail.slice(0, 23) + "…" : tail);
}

export function ServiceOverviewCanvas({
  projection,
  selectedId,
  connectionKey,
  highlightIds = [],
  filters,
  onFiltersChange,
  onService,
  onConnection,
  onClear,
  onDetails,
  onClearHighlight,
  active = true,
}: {
  projection: ServiceOverviewProjection;
  selectedId: string | null;
  connectionKey: string | null;
  highlightIds?: string[];
  filters: OverviewFilters;
  onFiltersChange: (filters: OverviewFilters) => void;
  onService: (id: string) => void;
  onConnection: (key: string) => void;
  onClear: () => void;
  onDetails: () => void;
  onClearHighlight?: () => void;
  active?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState("");
  const [page, setPage] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const section = useRef<HTMLElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const graph = useRef<Core | null>(null);
  const camera = useRef<NetworkSnapshot | undefined>(undefined);
  const callbacks = useRef({ onService, onConnection, onClear, selectedId, connectionKey });
  callbacks.current = { onService, onConnection, onClear, selectedId, connectionKey };
  const elements = useMemo(
    () => [
      ...projection.services.map((service, index) => ({
        group: "nodes" as const,
        data: {
          id: "service:" + service.id,
          sourceId: service.id,
          name: service.name,
          label: shortLabel(serviceName(projection.services, service.id)),
        },
        position: { x: (index % 5) * 280, y: Math.floor(index / 5) * 180 },
      })),
      ...projection.connections.map((connection) => ({
        group: "edges" as const,
        data: {
          id: connection.key,
          source: "service:" + connection.serviceIds[0],
          target: "service:" + connection.serviceIds[1],
          countLabel: String(connection.relationshipIds.length),
          summary: `${serviceName(projection.services, connection.serviceIds[0])} — ${serviceName(projection.services, connection.serviceIds[1])}: ${connection.relationshipIds.length} recorded relationship(s) · ${new Set(connection.relationships.map((row) => row.fromServiceId)).size} direction(s)`,
        },
      })),
    ],
    [projection],
  );
  function fit() {
    graph.current?.fit(undefined, 40);
  }
  function zoom(factor: number) {
    const cy = graph.current;
    if (!cy) return;
    cy.zoom({
      level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)),
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    const container = viewport.current;
    if (!container || !active) return;
    const saved = camera.current;
    const positions = serviceOverviewPositions(
      projection,
      container.clientWidth / Math.max(1, container.clientHeight),
    );
    const style = (): StylesheetStyle[] => {
      const dark = document.documentElement.classList.contains("dark");
      return [
        {
          selector: "node",
          style: {
            shape: "round-rectangle",
            width: SERVICE_WIDTH,
            height: SERVICE_HEIGHT,
            label: "data(label)",
            "text-wrap": "wrap",
            "text-max-width": "185px",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 13,
            "font-family": "sans-serif",
            "font-weight": 600,
            "background-color": dark ? "#182334" : "#ffffff",
            color: dark ? "#e2e8f0" : "#0f172a",
            "border-color": dark ? "#64748b" : "#cbd5e1",
            "border-width": 1.5,
            "overlay-opacity": 0,
          },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "taxi",
            "taxi-direction": "auto",
            "taxi-turn": "50%",
            "target-arrow-shape": "none",
            "source-arrow-shape": "none",
            "line-color": dark ? "#64748b" : "#94a3b8",
            width: 1.8,
            "overlay-opacity": 0,
            label: "",
          },
        },
        { selector: ".muted", style: { opacity: 0.18 } },
        {
          selector: "node.focused, node.search-match, node.hovered",
          style: { "border-color": dark ? "#93c5fd" : "#2563eb", "border-width": 3 },
        },
        {
          selector: "edge.focused, edge.hovered",
          style: {
            "line-color": dark ? "#93c5fd" : "#2563eb",
            width: 3,
            label: "data(countLabel)",
            "font-size": 11,
            color: dark ? "#e2e8f0" : "#0f172a",
            "text-background-color": dark ? "#182334" : "#ffffff",
            "text-background-opacity": 1,
            "text-background-padding": "3px",
          },
        },
      ];
    };
    const cy = cytoscape({
      container,
      elements: elements.map((element) =>
        element.group === "nodes"
          ? {
              ...element,
              position:
                saved?.positions.get(element.data.id) ?? positions.get(element.data.sourceId)!,
            }
          : element,
      ),
      style: style(),
      minZoom: 0.08,
      maxZoom: 3,
      userZoomingEnabled: false,
      autounselectify: true,
      boxSelectionEnabled: false,
      layout: { name: "preset", fit: !saved, padding: 40 },
    });
    if (!saved && cy.zoom() > 1)
      cy.zoom({ level: 1, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    if (saved) {
      cy.zoom(saved.zoom);
      cy.pan(saved.pan);
    }
    graph.current = cy;
    const updateCamera = () => {
      container.dataset["zoom"] = String(cy.zoom());
      container.dataset["panX"] = String(cy.pan().x);
      container.dataset["panY"] = String(cy.pan().y);
    };
    cy.on("zoom pan", updateCamera);
    updateCamera();
    cy.on("tap", "node", (event) => {
      const id = String(event.target.data("sourceId"));
      if (callbacks.current.selectedId === id) callbacks.current.onClear();
      else callbacks.current.onService(id);
    });
    cy.on("tap", "edge", (event) => {
      const key = String(event.target.id());
      if (callbacks.current.connectionKey === key) callbacks.current.onClear();
      else callbacks.current.onConnection(key);
    });
    cy.on("tap", (event) => {
      if (event.target === cy) callbacks.current.onClear();
    });
    cy.on("mouseover", "node, edge", (event) => {
      event.target.addClass("hovered");
      setHover(
        event.target.isNode()
          ? `${String(event.target.data("name"))} · ${String(event.target.data("sourceId"))}`
          : String(event.target.data("summary")),
      );
    });
    cy.on("mouseout", "node, edge", (event) => {
      event.target.removeClass("hovered");
      setHover("");
    });
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      cy.zoom({
        level: Math.max(
          cy.minZoom(),
          Math.min(
            cy.maxZoom(),
            cy.zoom() * Math.exp(-Math.max(-240, Math.min(240, delta)) * 0.0025),
          ),
        ),
        renderedPosition: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      });
    };
    container.addEventListener("wheel", wheel, { passive: false });
    const resize = new ResizeObserver(() => cy.resize());
    resize.observe(container);
    const theme = new MutationObserver(() => cy.style(style()));
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    setHover("");
    return () => {
      camera.current = captureNetworkSnapshot(cy, camera.current);
      resize.disconnect();
      theme.disconnect();
      container.removeEventListener("wheel", wheel);
      cy.destroy();
      graph.current = null;
    };
  }, [active, elements, projection]);
  useEffect(() => {
    const cy = graph.current;
    if (!cy || !active) return;
    const focus = overviewFocus(projection, selectedId, connectionKey, highlightIds);
    const search = query.trim().toLowerCase();
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const id = String(node.data("sourceId"));
        const match = !search || String(node.data("name")).toLowerCase().includes(search);
        node.toggleClass("muted", !match || (focus.active && !focus.nodes.has(id)));
        node.toggleClass("focused", focus.active && focus.nodes.has(id));
        node.toggleClass("search-match", Boolean(search) && match);
      });
      cy.edges().forEach((edge) => {
        edge.toggleClass("muted", focus.active && !focus.connections.has(edge.id()));
        edge.toggleClass("focused", focus.connections.has(edge.id()));
      });
    });
  }, [active, elements, projection, selectedId, connectionKey, highlightIds, query]);
  const matches = projection.services.filter((service) =>
    service.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(
    1,
    Math.ceil(matches.length / 25),
    Math.ceil(projection.connections.length / 25),
  );
  const currentPage = Math.min(page, pages - 1);
  return (
    <section
      ref={section}
      aria-label="Service overview"
      className="min-w-0 overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-center gap-2 border-b p-3 [&_button]:min-h-10">
        <label className="mr-auto">
          <span className="sr-only">Search services</span>
          <input
            aria-label="Search services"
            placeholder="Find a service…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        {query.trim() && (
          <Button
            size="sm"
            variant="outline"
            disabled={!matches.length}
            onClick={() => {
              const cy = graph.current;
              if (!cy) return;
              const matching = cy
                .nodes()
                .filter((node) =>
                  String(node.data("name")).toLowerCase().includes(query.trim().toLowerCase()),
                );
              if (!matching.length) return;
              cy.fit(matching, 40);
              if (cy.zoom() > 1)
                cy.zoom({ level: 1, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
            }}
          >
            Focus matches
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          aria-label="Zoom overview out"
          onClick={() => zoom(1 / 1.2)}
        >
          −
        </Button>
        <Button size="sm" variant="outline" aria-label="Zoom overview in" onClick={() => zoom(1.2)}>
          +
        </Button>
        <Button size="sm" variant="outline" onClick={fit}>
          Fit
        </Button>
        {highlightIds.length > 0 && (
          <Button size="sm" variant="outline" onClick={onClearHighlight}>
            Return to selection
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onClear}>
          Clear selection
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void (
                section.current?.closest<HTMLElement>("[data-architecture-workspace]") ??
                section.current
              )
                ?.requestFullscreen()
                .catch(() => setHover("Fullscreen is unavailable in this browser."));
          }}
        >
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </Button>
      </div>
      <div
        aria-live="polite"
        className="flex flex-wrap gap-x-4 gap-y-1 border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
      >
        <span>
          {projection.services.length} services · {projection.connections.length} connections ·{" "}
          {projection.relationshipCount} recorded relationships
        </span>
        {projection.filteredRelationships > 0 && (
          <span>{projection.filteredRelationships} relationships filtered</span>
        )}
        {query.trim() && (
          <span>
            {matches.length}/{projection.services.length} service names matched
          </span>
        )}
      </div>
      <details className="border-b p-3 text-sm">
        <summary className="cursor-pointer">Filters & graph help</summary>
        <ServiceRelationshipFilters
          filters={filters}
          protocols={projection.protocols}
          onChange={onFiltersChange}
        />
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          One line means recorded relationships, not direction, live traffic or health. Select a
          connection for its directions and evidence. Drag to move/pan; scroll to zoom. Arrow keys
          pan, +/− zoom, Home fits and Escape clears selection. Search highlights names without
          filtering relationships.
        </p>
      </details>
      <div className="relative">
        <div
          ref={viewport}
          role="region"
          aria-label="Service overview canvas"
          tabIndex={0}
          className="h-[620px] touch-none bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onKeyDown={(event) => {
            const cy = graph.current;
            if (!cy) return;
            if (event.key === "Escape") {
              event.preventDefault();
              onClear();
            } else if (["Home", "0"].includes(event.key)) {
              event.preventDefault();
              fit();
            } else if (["+", "=", "-"].includes(event.key)) {
              event.preventDefault();
              zoom(event.key === "-" ? 1 / 1.2 : 1.2);
            } else if (event.key.startsWith("Arrow")) {
              event.preventDefault();
              cy.panBy({
                x: event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0,
                y: event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0,
              });
            }
          }}
        />
        {!projection.services.length && (
          <p
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground"
          >
            No service containers were identified in this revision. Open Details to inspect
            available elements; no service ownership has been invented.
          </p>
        )}
        {hover && (
          <p
            role="tooltip"
            className="pointer-events-none absolute bottom-3 left-3 right-3 w-fit max-w-[calc(100%-24px)] break-words rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground"
          >
            {hover}
          </p>
        )}
      </div>
      <div className="space-y-2 border-t p-3 text-xs text-muted-foreground">
        {!projection.connections.length && projection.services.length > 0 && (
          <p role="status">
            No direct service relationships are recorded in the current scope. Services may still
            communicate through messaging/resources or unextracted code.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            {projection.hiddenInternals} internal elements · {projection.hiddenResources} resources
            · {projection.unassignedElements} unassigned elements outside this overview.{" "}
            {projection.internalRelationships} internal and {projection.nonServiceRelationships}{" "}
            resource/unmapped relationships remain in Details.
          </p>
          <Button variant="ghost" size="sm" onClick={onDetails}>
            Open Details
          </Button>
        </div>
        <details>
          <summary className="cursor-pointer">Services & connections — keyboard navigation</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ul className="max-h-64 space-y-1 overflow-auto">
              {matches.slice(currentPage * 25, currentPage * 25 + 25).map((service) => (
                <li key={service.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === service.id}
                    onClick={() => onService(service.id)}
                    className="min-h-11 w-full break-words rounded border px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {serviceName(projection.services, service.id)}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="max-h-64 space-y-1 overflow-auto">
              {projection.connections
                .slice(currentPage * 25, currentPage * 25 + 25)
                .map((connection) => (
                  <li key={connection.key}>
                    <button
                      type="button"
                      aria-pressed={connectionKey === connection.key}
                      onClick={() => onConnection(connection.key)}
                      className="min-h-11 w-full break-words rounded border px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {serviceName(projection.services, connection.serviceIds[0])} —{" "}
                      {serviceName(projection.services, connection.serviceIds[1])}
                      <span className="block text-xs text-muted-foreground">
                        {connection.relationshipIds.length} relationship(s)
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
          {pages > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span>
                {currentPage + 1}/{pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= pages - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </details>
      </div>
    </section>
  );
}
