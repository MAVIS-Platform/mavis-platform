import type { Core, StylesheetStyle } from "cytoscape";
import type { ArchitecturalModel } from "@/types/domain";
import { explorePositions } from "./explore-layout";

export type NetworkMode = "analysis" | "explore";

// A presentation of the same source graph: no synthetic nodes, edges or groups.
export const exploreStyles: StylesheetStyle[] = [
  {
    selector: "node.explore",
    style: {
      width: "data(exploreSize)",
      height: "data(exploreSize)",
      color: "#dbe4f5",
      "border-color": "data(exploreColor)",
      "border-width": 0,
      "background-opacity": 0,
      "background-image": "data(glowImage)",
      "background-width": "100%",
      "background-height": "100%",
      label: "data(name)",
      "text-valign": "center",
      "text-margin-y": 22,
      "font-family": "sans-serif",
      "text-background-color": "#080b16",
      "text-background-opacity": 0.85,
      "text-opacity": 0,
      "overlay-color": "data(color)",
      "overlay-opacity": 0,
      "overlay-padding": "data(haloSize)",
      "overlay-shape": "ellipse",
    },
  },
  {
    selector: "edge.explore",
    style: {
      width: 0.7,
      opacity: 0.4,
      "line-color": "data(exploreColor)",
      "target-arrow-color": "data(exploreColor)",
      "target-arrow-shape": "none",
      "source-endpoint": "inside-to-node",
      "target-endpoint": "inside-to-node",
    },
  },
  {
    selector:
      "node.explore.hub, node.explore.detail, node.explore.neighbor, node.explore.hover-neighbor",
    style: { "text-opacity": 1 },
  },
  {
    selector: "node.explore.focused, node.explore.search-match, node.explore.hovered",
    style: {
      "text-opacity": 1,
      "font-weight": "bold",
      "border-width": 0,
      "text-outline-color": "#080b16",
      "text-outline-width": 2,
    },
  },
  {
    selector: "edge.explore.focused, edge.explore.hover-neighbor",
    style: { opacity: 0.95, width: 1.8, "arrow-scale": 0.7, "target-arrow-shape": "triangle" },
  },
  { selector: "node.explore.muted", style: { opacity: 0.18, "overlay-opacity": 0 } },
  { selector: "edge.explore.muted", style: { opacity: 0.04 } },
];

export function applyNetworkMode(cy: Core, mode: NetworkMode) {
  cy.batch(() => {
    cy.elements().toggleClass("explore", mode === "explore");
    cy.nodes().toggleClass("detail", mode === "explore" && cy.zoom() >= 1.1);
  });
}

// Each presentation keeps its own dragged positions and camera. The first visit
// to Explore uses actual connectivity/parent ownership for a compact atlas.
export type NetworkSnapshot = {
  positions: Map<string, { x: number; y: number }>;
  zoom: number;
  pan: { x: number; y: number };
};

export function captureNetworkSnapshot(cy: Core, previous?: NetworkSnapshot): NetworkSnapshot {
  return {
    positions: new Map([
      ...(previous?.positions ?? []),
      ...cy.nodes().map((n) => [n.id(), { ...n.position() }] as const),
    ]),
    zoom: cy.zoom(),
    pan: { ...cy.pan() },
  };
}

export function createNetworkPresentation(
  cy: Core,
  model: ArchitecturalModel,
  snapshots = new Map<NetworkMode, NetworkSnapshot>(),
  initialMode: NetworkMode = "analysis",
) {
  let current = initialMode;
  return (mode: NetworkMode) => {
    if (mode === current) {
      applyNetworkMode(cy, mode);
      return;
    }
    snapshots.set(current, captureNetworkSnapshot(cy, snapshots.get(current)));
    applyNetworkMode(cy, mode);
    const saved = snapshots.get(mode);
    cy.batch(() => {
      if (saved) {
        cy.nodes().positions((n) => saved.positions.get(n.id()) ?? n.position());
        cy.zoom(saved.zoom);
        cy.pan(saved.pan);
      } else if (mode === "explore" && model.elements.length <= 300) {
        const positions = explorePositions(model);
        cy.nodes().positions((n) => positions.get(n.data("sourceId")) ?? n.position());
        cy.fit(undefined, 80);
      }
    });
    current = mode;
    applyNetworkMode(cy, mode);
  };
}
