import { respectPins } from "./pinned-layout";
import { twoHubLayout } from "./two-hub-layout";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import { inspectGeometry, type Rect, type Route } from "./geometry";
import {
  RULE_VERSION,
  kindOf,
  ends,
  relationLabel,
  nodeText,
  nodeStyle,
  nodeHtml,
  palette,
  wrapText,
  type DiagramDocument,
  type DrawioTheme,
} from "./rules";
const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "&#xa;");
const safe = (id: string) =>
  "n_" +
  Array.from(id)
    .map((character) => character.codePointAt(0)!.toString(16))
    .join("_");
const n = (value: number) => Math.round(value * 100) / 100;
export async function generateDrawio(
  doc: DiagramDocument,
  theme: DrawioTheme = "clean",
  layout: (graph: ElkNode) => Promise<ElkNode>,
) {
  const nodes = [...doc.layoutJson.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...doc.layoutJson.edges].sort((a, b) => a.id.localeCompare(b.id));
  if (nodes.length > 100 || edges.length > 200)
    throw new Error("Select a smaller diagram scope (maximum 100 nodes / 200 relationships).");
  const nodeIds = new Set(nodes.map((node) => node.id));
  const component = doc.notation === "C4" && doc.level === "COMPONENT";
  const parents = new Set(
    component
      ? nodes
          .filter((node) => node.parentId && nodeIds.has(node.parentId))
          .map((node) => node.parentId!)
      : [],
  );
  const graphs = new Map<string, ElkNode>();
  const groupGraphs = new Map<string, ElkNode>();
  const groupOf = new Map<string, string>();
  for (const parent of parents) {
    const record = nodes.find((node) => node.id === parent)!;
    const group: ElkNode = {
      id: "boundary_" + parent,
      children: [],
      ports: [],
      layoutOptions: {
        "elk.padding": "[top=60,left=32,bottom=32,right=32]",
        "elk.algorithm": "layered",
      },
      labels: [{ text: record.name + " · Components", width: 280, height: 28 }],
    };
    groupGraphs.set(parent, group);
  }
  for (const node of nodes) {
    if (parents.has(node.id)) {
      graphs.set(node.id, groupGraphs.get(node.id)!);
      groupOf.set(node.id, node.id);
      continue;
    }
    const lines = nodeText(node);
    const graph: ElkNode = {
      id: node.id,
      width: 280,
      height: Math.max(128, lines.length * 20 + 32),
      ports: [],
      layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
    };
    graphs.set(node.id, graph);
    const parent =
      node.parentId && groupGraphs.has(node.parentId)
        ? node.parentId
        : parents.has(node.id)
          ? node.id
          : null;
    if (parent) {
      groupGraphs.get(parent)!.children!.push(graph);
      groupOf.set(node.id, parent);
    }
  }
  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => {
    const { from, to } = ends(edge);
    const out = edge.id + "_out",
      input = edge.id + "_in";
    graphs
      .get(from)!
      .ports!.push({ id: out, width: 2, height: 2, layoutOptions: { "elk.port.side": "EAST" } });
    graphs
      .get(to)!
      .ports!.push({ id: input, width: 2, height: 2, layoutOptions: { "elk.port.side": "WEST" } });
    const text = wrapText(relationLabel(edge), 24).join("\n");
    return {
      id: edge.id,
      sources: [out],
      targets: [input],
      labels: [
        {
          text,
          width: Math.max(...text.split("\n").map((line) => Array.from(line).length)) * 7.5 + 16,
          height: text.split("\n").length * 17 + 10,
        },
      ],
    };
  });
  const root: ElkNode = {
    id: "root",
    children: [
      ...groupGraphs.values(),
      ...nodes.filter((node) => !groupOf.has(node.id)).map((node) => graphs.get(node.id)!),
    ],
    edges: elkEdges,
  };
  let best:
    | {
        graph: ElkNode;
        rects: Rect[];
        labels: Rect[];
        routes: Route[];
        groups: Rect[];
        quality: ReturnType<typeof inspectGeometry>;
      }
    | undefined;
  const collect = (graph: ElkNode) => {
    const rects: Rect[] = [],
      groups: Rect[] = [],
      labels: Rect[] = [],
      routes: Route[] = [];
    function visit(parent: ElkNode, ox: number, oy: number) {
      for (const child of parent.children ?? []) {
        const r = {
          id: child.id,
          x: ox + (child.x ?? 0),
          y: oy + (child.y ?? 0),
          width: child.width ?? 0,
          height: child.height ?? 0,
        };
        if (child.children) groups.push(r);
        else rects.push(r);
        visit(child, r.x, r.y);
      }
      for (const edge of parent.edges ?? []) {
        const container = groups.find((group) => group.id === edge.container);
        const edgeX = container?.x ?? ox,
          edgeY = container?.y ?? oy;
        const original = edges.find((item) => item.id === edge.id)!;
        const { from, to } = ends(original);
        for (const section of edge.sections ?? [])
          routes.push({
            id: edge.id,
            from,
            to,
            points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
              (point) => ({ x: point.x + edgeX, y: point.y + edgeY }),
            ),
          });
        for (const label of edge.labels ?? [])
          labels.push({
            id: edge.id,
            x: (label.x ?? 0) + edgeX,
            y: (label.y ?? 0) + edgeY,
            width: label.width ?? 0,
            height: label.height ?? 0,
          });
      }
    }
    visit(graph, 0, 0);
    return {
      graph,
      rects,
      labels,
      routes,
      groups,
      quality: inspectGeometry(rects, labels, routes),
    };
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidateRoot = structuredClone(root);
    const vertical = attempt === 1;
    function alignPorts(node: ElkNode) {
      for (const port of node.ports ?? [])
        port.layoutOptions = {
          "elk.port.side": port.id.endsWith("_out")
            ? vertical
              ? "SOUTH"
              : "EAST"
            : vertical
              ? "NORTH"
              : "WEST",
        };
      for (const child of node.children ?? []) alignPorts(child);
    }
    alignPorts(candidateRoot);
    const graph = await layout({
      ...candidateRoot,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": vertical ? "DOWN" : "RIGHT",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.randomSeed": ["1", "7", "37"][attempt]!,
        "elk.spacing.nodeNode": String(64 + attempt * 32),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(140 + attempt * 50),
        "elk.spacing.edgeNode": "24",
        "elk.spacing.edgeEdge": "18",
        "elk.spacing.labelNode": "18",
        "elk.layered.spacing.edgeNodeBetweenLayers": "24",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "18",
        "elk.layered.mergeEdges": "false",
        "elk.padding": "[top=36,left=36,bottom=36,right=36]",
      },
    });
    const candidate = collect(graph);
    if (
      !best ||
      (!candidate.quality.needsReview && best.quality.needsReview) ||
      (candidate.quality.needsReview === best.quality.needsReview &&
        candidate.quality.crossings < best.quality.crossings)
    )
      best = candidate;
    if (!candidate.quality.needsReview && candidate.quality.crossings === 0) break;
  }
  if (!parents.size) {
    const planar = twoHubLayout(
      nodes.map((node) => ({
        id: node.id,
        x: 0,
        y: 0,
        width: graphs.get(node.id)!.width!,
        height: graphs.get(node.id)!.height!,
      })),
      edges,
    );
    if (
      planar &&
      !planar.quality.needsReview &&
      (!best || planar.quality.crossings < best.quality.crossings)
    )
      best = planar;
  }
  if (
    !best ||
    best.rects.length + best.groups.length !== nodes.length ||
    new Set(best.routes.map((route) => route.id)).size !== edges.length
  )
    throw new Error("Layout did not preserve diagram topology");
  best = respectPins(best, doc);
  if (best.quality.needsReview)
    throw new Error("Diagram requires a smaller scope: layout has geometry collisions");
  const p = palette(theme),
    offset = { x: 48, y: 112 };
  const quality = escape(JSON.stringify(best.quality));
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const geometry = (x: number, y: number, width: number, height: number) =>
    `<mxGeometry x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" as="geometry"/>`;
  cells.push(
    `<mxCell id="mavis_title" mavisRuleVersion="${RULE_VERSION}" mavisTheme="${theme}" mavisQuality="${quality}" mavisOmittedNodes="${Number(doc["omittedNodes"] ?? 0)}" mavisOmittedEdges="${Number(doc["omittedEdges"] ?? 0)}" value="${escape(doc.notation + " · " + doc.level + (doc["scopeContainerId"] ? " · " + nodes.find((node) => node.id === doc["scopeContainerId"])?.name : " · overview"))}" style="text;html=0;fontFamily=Arial;fontSize=20;fontStyle=1;fontColor=${p.text};align=left;" vertex="1" parent="1">${geometry(48, 24, 1000, 36)}</mxCell>`,
  );
  cells.push(
    `<mxCell id="mavis_scope" value="${escape(`${RULE_VERSION} · ${nodes.length} elements · ${edges.length} relationships · omitted ${doc["omittedNodes"] ?? 0} elements / ${doc["omittedEdges"] ?? 0} relationships`)}" style="text;html=0;fontFamily=Arial;fontSize=12;fontColor=${p.text};align=left;" vertex="1" parent="1">${geometry(48, 64, 1000, 28)}</mxCell>`,
  );
  for (const group of best.groups) {
    const owner = group.id.slice("boundary_".length);
    cells.push(
      `<mxCell id="${safe(group.id)}" mavisId="${escape(owner)}" mavisName="${escape(nodes.find((node) => node.id === owner)?.name ?? "Container")}" value="${escape(nodes.find((node) => node.id === owner)?.name + " · component scope")}" mavisRole="boundary" style="swimlane;horizontal=1;startSize=44;rounded=1;dashed=1;fillColor=${p.background};swimlaneFillColor=${p.background};fontColor=${p.text};strokeColor=${p.border};fontFamily=Arial;fontSize=16;collapsible=0;${nodes.find((node) => node.id === owner)?.["pinned"] ? "movable=0;resizable=0;rotatable=0;deletable=0;editable=0;locked=1;connectable=0;" : ""}" vertex="1" parent="1">${geometry(group.x + offset.x, group.y + offset.y, group.width, group.height)}</mxCell>`,
    );
  }
  for (const node of nodes) {
    if (parents.has(node.id)) continue;
    const rect = best.rects.find((item) => item.id === node.id)!;
    const parent = groupOf.get(node.id);
    const group = parent ? best.groups.find((item) => item.id === "boundary_" + parent) : null;
    cells.push(
      `<mxCell id="${safe(node.id)}" value="${escape(nodeHtml(node))}" mavisId="${escape(node.id)}" mavisRole="${escape(kindOf(node))}" mavisName="${escape(node.name)}" mavisTechnology="${escape(node.languageStack ?? "")}" mavisDescription="${escape(node.description ?? "")}" style="${nodeStyle(kindOf(node), theme).replace("html=0", "html=1")}${node["pinned"] ? "movable=0;resizable=0;rotatable=0;deletable=0;editable=0;locked=1;connectable=0;" : ""}" vertex="1" parent="${group ? safe(group.id) : "1"}">${geometry(rect.x + (group ? -group.x : offset.x), rect.y + (group ? -group.y : offset.y), rect.width, rect.height)}</mxCell>`,
    );
  }
  for (const edge of edges) {
    const route = best.routes.find((item) => item.id === edge.id)!;
    const start = route.points[0]!,
      end = route.points.at(-1)!;
    const from =
        best.rects.find((item) => item.id === route.from) ??
        best.groups.find((item) => item.id === "boundary_" + route.from)!,
      to =
        best.rects.find((item) => item.id === route.to) ??
        best.groups.find((item) => item.id === "boundary_" + route.to)!;
    const label = best.labels.find((item) => item.id === edge.id);
    const declared =
      (edge.relationType ?? edge.type) === "DECLARED_COMPOSE" || edge.originLayer === "DEPLOYMENT";
    const port = (point: { x: number; y: number }, rect: Rect) => ({
      x: Math.max(0, Math.min(1, (point.x - rect.x) / rect.width)),
      y: Math.max(0, Math.min(1, (point.y - rect.y) / rect.height)),
    });
    const out = port(start, from),
      input = port(end, to);
    const points = route.points
      .slice(1, -1)
      .map((point) => `<mxPoint x="${n(point.x + offset.x)}" y="${n(point.y + offset.y)}"/>`)
      .join("");
    cells.push(
      `<mxCell id="${safe(edge.id)}" value="" mavisId="${escape(edge.id)}" mavisRole="edge" mavisRelationType="${escape(edge.relationType ?? edge.type ?? "")}" mavisOriginLayer="${escape(edge.originLayer ?? "")}" style="edgeStyle=none;orthogonal=1;rounded=0;endArrow=block;endFill=1;strokeWidth=1.5;strokeColor=${p.line};dashed=${declared ? 1 : 0};exitX=${out.x};exitY=${out.y};exitPerimeter=0;entryX=${input.x};entryY=${input.y};entryPerimeter=0;" edge="1" parent="1" source="${safe(parents.has(route.from) ? "boundary_" + route.from : route.from)}" target="${safe(parents.has(route.to) ? "boundary_" + route.to : route.to)}"><mxGeometry relative="1" as="geometry"><Array as="points">${points}</Array></mxGeometry></mxCell>`,
    );
    if (label)
      cells.push(
        `<mxCell id="label_${safe(edge.id)}" value="${escape(wrapText(relationLabel(edge), 24).join("\n"))}" mavisRole="edge-label" mavisEdgeId="${escape(edge.id)}" style="text;html=0;fontFamily=Arial;fontSize=13;fontColor=${p.text};fillColor=${p.background};strokeColor=none;whiteSpace=wrap;spacing=4;align=center;verticalAlign=middle;" vertex="1" parent="1">${geometry(label.x + offset.x, label.y + offset.y, label.width, label.height)}</mxCell>`,
      );
  }
  const bottom = (best.graph.height ?? 0) + offset.y + 32;
  const legend =
    "Legend: Container / Component / Database / Queue / External. Solid = source-inferred; dashed = declared configuration. No runtime status is implied. Missing technology or responsibility remains unknown. Crossings: " +
    best.quality.crossings;
  cells.push(
    `<mxCell id="mavis_legend" value="${escape(wrapText(legend, 100).join("\n"))}" mavisRole="legend" style="text;html=0;fontFamily=Arial;fontSize=13;fontColor=${p.text};fillColor=${p.background};whiteSpace=wrap;align=left;spacing=12;" vertex="1" parent="1">${geometry(48, bottom, 900, 100)}</mxCell>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="MAVIS" agent="MAVIS" version="1"><diagram id="${escape(doc["diagramId"] ?? doc.modelVersionId)}" name="${escape(doc.notation + " · " + doc.level)}"><mxGraphModel mavisRuleVersion="${RULE_VERSION}" mavisTheme="${theme}" mavisQuality="${quality}" mavisContainerId="${escape(doc["scopeContainerId"] ?? "")}" grid="0" gridSize="16" page="0" background="${p.background}" connect="1" arrows="1" math="0" shadow="0"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}
