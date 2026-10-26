import { compactOverview } from "./compact-overview";
import { respectPins } from "./pinned-layout";
import { twoHubLayout } from "./two-hub-layout";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import {
  applyPortRhythmBridge,
  inspectGeometry,
  segmentRectClearanceWithin,
  slidingLabelCandidates,
  snap4,
  type Rect,
  type Route,
} from "./geometry";
import {
  RULE_VERSION,
  kindOf,
  ends,
  relationLabel,
  containerMessagingLabel,
  containerDatabaseLabel,
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
  const nodes = [...doc.layoutJson.nodes].sort((a, b) =>
    `${a.name}:${a.kind ?? a.type}:${a.parentId ?? ""}`.localeCompare(
      `${b.name}:${b.kind ?? b.type}:${b.parentId ?? ""}`,
    ),
  );
  const edges = [...doc.layoutJson.edges].sort((a, b) => a.id.localeCompare(b.id));
  if (nodes.length > 100 || edges.length > 200)
    throw new Error("Select a smaller diagram scope (maximum 100 nodes / 200 relationships).");
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const component = doc.notation === "C4" && doc.level === "COMPONENT";
  // S2d: the C4 Container view nests internal containers under a named system boundary node
  // (kind SYSTEM_BOUNDARY); external/unresolved nodes stay outside the boundary group.
  const systemBoundary = doc.notation === "C4" && doc.level === "CONTAINER";
  const parents = new Set(
    component || systemBoundary
      ? nodes
          .filter((node) => node.parentId && nodeIds.has(node.parentId))
          .map((node) => node.parentId!)
      : [],
  );
  const graphs = new Map<string, ElkNode>();
  const groupGraphs = new Map<string, ElkNode>();
  const groupOf = new Map<string, string>();
  // Boundary headers wrap and size dynamically so long system/view names never cover nodes.
  const boundaryHeader = (record: (typeof nodes)[number]) => {
    const text =
      kindOf(record) === "SYSTEM_BOUNDARY"
        ? `${record.name} · ${record.description ?? "Software system"}`
        : record.name + " · Components";
    const lines = wrapText(text, 60);
    return { text: lines.join("\n"), height: 24 + lines.length * 20 };
  };
  for (const parent of parents) {
    const record = nodes.find((node) => node.id === parent)!;
    const header = boundaryHeader(record);
    const group: ElkNode = {
      id: "boundary_" + parent,
      children: [],
      ports: [],
      layoutOptions: {
        "elk.padding": `[top=${header.height + 16},left=32,bottom=32,right=32]`,
        "elk.algorithm": "layered",
      },
      labels: [{ text: header.text, width: 280, height: header.height }],
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
    const isDatabase = kindOf(node) === "DATABASE";
    const graph: ElkNode = {
      id: node.id,
      width: 280,
      height: Math.max(isDatabase ? 152 : 128, lines.length * 22 + (isDatabase ? 56 : 32)),
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
  // S2e: one shared label formatter for both the ELK label sizing and the exported label cell,
  // so measured width and rendered text can never diverge. Protocol augmentation is enabled
  // only for the C4 Container view and only for MESSAGE_PUBLISH/MESSAGE_SUBSCRIBE edges.
  const labelText = (edge: (typeof edges)[number]) =>
    wrapText(
      (systemBoundary ? (containerMessagingLabel(edge, nodesById) ?? containerDatabaseLabel(edge, nodesById)) : null) ?? relationLabel(edge),
      24,
    ).join("\n");
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
    const text = labelText(edge);
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
    const boxOf = (id: string) =>
      rects.find((r) => r.id === id) ?? groups.find((g) => g.id === "boundary_" + id);
    const pairKeys = new Set<string>();
    for (const r of routes) {
      const [a, b] = [r.from, r.to].sort();
      pairKeys.add(`${a}:::${b}`);
    }
    for (const key of pairKeys) {
      const [idA, idB] = key.split(":::");
      const boxA = boxOf(idA!),
        boxB = boxOf(idB!);
      if (!boxA || !boxB) continue;
      const pairRoutes = routes.filter(
        (r) => (r.from === idA && r.to === idB) || (r.from === idB && r.to === idA),
      );
      if (!pairRoutes.some((r) => r.points.length > 2)) continue;

      const [leftBox, rightBox] = boxA.x <= boxB.x ? [boxA, boxB] : [boxB, boxA];
      const gapXLeft = leftBox.x + leftBox.width;
      const gapXRight = rightBox.x;

      if (gapXLeft + 16 <= gapXRight) {
        const overlapTop = Math.max(leftBox.y + 18, rightBox.y + 18);
        const overlapBot = Math.min(
          leftBox.y + leftBox.height - 18,
          rightBox.y + rightBox.height - 18,
        );
        if (overlapBot - overlapTop >= 20) {
          const curQuality = inspectGeometry(rects, labels, routes);
          const nextRoutes = routes.map((r) => ({ ...r, points: [...r.points] }));
          const nextLabels = labels.map((l) => ({ ...l }));

          if (pairRoutes.length === 2) {
            const rl =
              pairRoutes.find((r) => r.from === rightBox.id && r.to === leftBox.id) ??
              pairRoutes[0]!;
            const lr = pairRoutes.find((r) => r.id !== rl.id) ?? pairRoutes[1]!;
            const y1 = Math.round(overlapTop + (overlapBot - overlapTop) * 0.3);
            const y2 = Math.round(overlapTop + (overlapBot - overlapTop) * 0.7);

            const rlTarget = nextRoutes.find((r) => r.id === rl.id)!;
            rlTarget.points =
              rl.from === rightBox.id
                ? [
                    { x: gapXRight, y: y1 },
                    { x: gapXLeft, y: y1 },
                  ]
                : [
                    { x: gapXLeft, y: y1 },
                    { x: gapXRight, y: y1 },
                  ];
            const lrTarget = nextRoutes.find((r) => r.id === lr.id)!;
            lrTarget.points =
              lr.from === leftBox.id
                ? [
                    { x: gapXLeft, y: y2 },
                    { x: gapXRight, y: y2 },
                  ]
                : [
                    { x: gapXRight, y: y2 },
                    { x: gapXLeft, y: y2 },
                  ];

            const placeLabelSafely = (edgeId: string, candidateYList: number[]) => {
              const lbl = nextLabels.find((l) => l.id === edgeId);
              if (!lbl) return;
              const origX = lbl.x,
                origY = lbl.y;
              const centeredX = Math.round((gapXLeft + gapXRight - lbl.width) / 2);
              for (const cy of candidateYList) {
                lbl.x = centeredX;
                lbl.y = Math.round(cy);
                const otherNodes = rects.filter((n) => n.id !== leftBox.id && n.id !== rightBox.id);
                const otherLabels = nextLabels.filter((l) => l.id !== edgeId);
                const check = inspectGeometry(
                  [leftBox, rightBox, ...otherNodes],
                  [lbl, ...otherLabels],
                  [],
                );
                if (check.labelNodeOverlaps === 0 && check.labelOverlaps === 0) return;
              }
              lbl.x = origX;
              lbl.y = origY;
            };

            const rlLabel = nextLabels.find((l) => l.id === rl.id);
            if (rlLabel) {
              placeLabelSafely(rl.id, [
                y1 - rlLabel.height - 6,
                Math.min(leftBox.y, rightBox.y) - rlLabel.height - 6,
              ]);
            }
            const lrLabel = nextLabels.find((l) => l.id === lr.id);
            if (lrLabel) {
              placeLabelSafely(lr.id, [
                y2 + 6,
                Math.max(leftBox.y + leftBox.height, rightBox.y + rightBox.height) + 6,
              ]);
            }
          } else if (pairRoutes.length === 1) {
            const single = pairRoutes[0]!;
            const ym = Math.round((overlapTop + overlapBot) / 2);
            const target = nextRoutes.find((r) => r.id === single.id)!;
            target.points =
              single.from === rightBox.id
                ? [
                    { x: gapXRight, y: ym },
                    { x: gapXLeft, y: ym },
                  ]
                : [
                    { x: gapXLeft, y: ym },
                    { x: gapXRight, y: ym },
                  ];
            const lbl = nextLabels.find((l) => l.id === single.id);
            if (lbl) {
              const origX = lbl.x,
                origY = lbl.y;
              const centeredX = Math.round((gapXLeft + gapXRight - lbl.width) / 2);
              const candidates = [
                ym - lbl.height - 6,
                ym + 6,
                Math.min(leftBox.y, rightBox.y) - lbl.height - 6,
                Math.max(leftBox.y + leftBox.height, rightBox.y + rightBox.height) + 6,
              ];
              let placed = false;
              for (const cy of candidates) {
                lbl.x = centeredX;
                lbl.y = Math.round(cy);
                if (!inspectGeometry(rects, nextLabels, nextRoutes).needsReview) {
                  placed = true;
                  break;
                }
              }
              if (!placed) {
                lbl.x = origX;
                lbl.y = origY;
              }
            }
          }

          const nextQuality = inspectGeometry(rects, nextLabels, nextRoutes);
          if (!nextQuality.needsReview && nextQuality.crossings <= curQuality.crossings) {
            routes.splice(0, routes.length, ...nextRoutes);
            labels.splice(0, labels.length, ...nextLabels);
            continue;
          }
        }
      }

      const [topBox, botBox] = boxA.y <= boxB.y ? [boxA, boxB] : [boxB, boxA];
      const gapYTop = topBox.y + topBox.height;
      const gapYBot = botBox.y;
      if (gapYTop + 16 <= gapYBot) {
        const overlapLeft = Math.max(topBox.x + 18, botBox.x + 18);
        const overlapRight = Math.min(
          topBox.x + topBox.width - 18,
          botBox.x + botBox.width - 18,
        );
        if (overlapRight - overlapLeft >= 20) {
          const curQuality = inspectGeometry(rects, labels, routes);
          const nextRoutes = routes.map((r) => ({ ...r, points: [...r.points] }));
          const nextLabels = labels.map((l) => ({ ...l }));
          if (pairRoutes.length === 2) {
            const bt =
              pairRoutes.find((r) => r.from === botBox.id && r.to === topBox.id) ??
              pairRoutes[0]!;
            const tb = pairRoutes.find((r) => r.id !== bt.id) ?? pairRoutes[1]!;
            const x1 = snap4(overlapLeft + (overlapRight - overlapLeft) * 0.35);
            const x2 = snap4(overlapLeft + (overlapRight - overlapLeft) * 0.65);
            const btTarget = nextRoutes.find((r) => r.id === bt.id)!;
            btTarget.points =
              bt.from === botBox.id
                ? [
                    { x: x1, y: gapYBot },
                    { x: x1, y: gapYTop },
                  ]
                : [
                    { x: x1, y: gapYTop },
                    { x: x1, y: gapYBot },
                  ];
            const tbTarget = nextRoutes.find((r) => r.id === tb.id)!;
            tbTarget.points =
              tb.from === topBox.id
                ? [
                    { x: x2, y: gapYTop },
                    { x: x2, y: gapYBot },
                  ]
                : [
                    { x: x2, y: gapYBot },
                    { x: x2, y: gapYTop },
                  ];
            const btLbl = nextLabels.find((l) => l.id === bt.id);
            if (btLbl) {
              btLbl.x = snap4(x1 - btLbl.width - 8);
              btLbl.y = snap4((gapYTop + gapYBot - btLbl.height) / 2);
            }
            const tbLbl = nextLabels.find((l) => l.id === tb.id);
            if (tbLbl) {
              tbLbl.x = snap4(x2 + 8);
              tbLbl.y = snap4((gapYTop + gapYBot - tbLbl.height) / 2);
            }
          } else if (pairRoutes.length === 1) {
            const single = pairRoutes[0]!;
            const xm = Math.round((overlapLeft + overlapRight) / 2);
            const target = nextRoutes.find((r) => r.id === single.id)!;
            target.points =
              single.from === botBox.id
                ? [
                    { x: xm, y: gapYBot },
                    { x: xm, y: gapYTop },
                  ]
                : [
                    { x: xm, y: gapYTop },
                    { x: xm, y: gapYBot },
                  ];
            const lbl = nextLabels.find((l) => l.id === single.id);
            if (lbl) {
              lbl.x = Math.round(xm + 8);
              lbl.y = Math.round((gapYTop + gapYBot - lbl.height) / 2);
            }
          }
          const nextQuality = inspectGeometry(rects, nextLabels, nextRoutes);
          if (!nextQuality.needsReview && nextQuality.crossings <= curQuality.crossings) {
            routes.splice(0, routes.length, ...nextRoutes);
            labels.splice(0, labels.length, ...nextLabels);
          }
        }
      }
    }

    // Remove unnecessary left/right wrap-around hooks when a long orthogonal route approaches a node from below or above
    for (const r of routes) {
      if (r.points.length < 4) continue;
      const toBox = boxOf(r.to);
      if (!toBox) continue;
      const endPt = r.points.at(-1)!;
      const prev1 = r.points.at(-2)!;
      const prev2 = r.points.at(-3)!;
      const hitsLeftOrRight =
        Math.abs(endPt.x - toBox.x) < 2 || Math.abs(endPt.x - (toBox.x + toBox.width)) < 2;
      if (!hitsLeftOrRight) continue;
      const centerX = Math.round(toBox.x + toBox.width / 2);
      // Approaching from below the target box
      if (prev2.y > toBox.y + toBox.height + 12 && Math.abs(prev1.y - endPt.y) < 2) {
        const candidatePts = [
          ...r.points.slice(0, -2),
          { x: centerX, y: prev2.y },
          { x: centerX, y: toBox.y + toBox.height },
        ];
        const testRoutes = routes.map((item) =>
          item.id === r.id ? { ...item, points: candidatePts } : item,
        );
        const curQ = inspectGeometry(rects, labels, routes);
        const nextQ = inspectGeometry(rects, labels, testRoutes);
        if (!nextQ.needsReview && nextQ.crossings <= curQ.crossings) {
          r.points = candidatePts;
          const lbl = labels.find((l) => l.id === r.id);
          if (lbl && lbl.y > toBox.y + toBox.height) {
            lbl.x = Math.round(centerX + 12);
          }
        }
      } else if (prev2.y < toBox.y - 12 && Math.abs(prev1.y - endPt.y) < 2) {
        // Approaching from above the target box
        const candidatePts = [
          ...r.points.slice(0, -2),
          { x: centerX, y: prev2.y },
          { x: centerX, y: toBox.y },
        ];
        const testRoutes = routes.map((item) =>
          item.id === r.id ? { ...item, points: candidatePts } : item,
        );
        const curQ = inspectGeometry(rects, labels, routes);
        const nextQ = inspectGeometry(rects, labels, testRoutes);
        if (!nextQ.needsReview && nextQ.crossings <= curQ.crossings) {
          r.points = candidatePts;
        }
      }
    }

    // Archify Phase 4 & 5: One-bend L-route probe, Port Rhythm Bridge, and Sliding Label Clearance
    for (const r of routes) {
      if (r.points.length >= 4) {
        const bridged = applyPortRhythmBridge(r.points, 16);
        if (bridged.length !== r.points.length || bridged.some((p, i) => p.x !== r.points[i]?.x || p.y !== r.points[i]?.y)) {
          const testRoutes = routes.map((item) => (item.id === r.id ? { ...item, points: bridged } : item));
          const curQ = inspectGeometry(rects, labels, routes);
          const nextQ = inspectGeometry(rects, labels, testRoutes);
          if (!nextQ.needsReview && nextQ.crossings <= curQ.crossings && nextQ.borderRides <= curQ.borderRides) {
            r.points = bridged;
          }
        }
      }
      // Sliding label repair when a label overlaps a box, another label, or masks an unrelated route segment
      const lbl = labels.find((l) => l.id === r.id);
      if (!lbl) continue;
      const otherRoutes = routes.filter((other) => other.id !== r.id);
      const masksOtherRoute = (box: Rect) =>
        otherRoutes.some((other) =>
          other.points.slice(1).some((pt, i) => segmentRectClearanceWithin(other.points[i]!, pt, box, 4)),
        );
      const overlapsBoxOrLabel = (box: Rect) =>
        rects.some(
          (n) =>
            box.x < n.x + n.width + 2 &&
            box.x + box.width > n.x - 2 &&
            box.y < n.y + n.height + 2 &&
            box.y + box.height > n.y - 2,
        ) ||
        labels.some(
          (o) =>
            o.id !== box.id &&
            box.x < o.x + o.width + 4 &&
            box.x + box.width > o.x - 4 &&
            box.y < o.y + o.height + 4 &&
            box.y + box.height > o.y - 4,
        );
      if (overlapsBoxOrLabel(lbl) || masksOtherRoute(lbl)) {
        const segIndices = r.points
          .slice(1)
          .map((pt, i) => ({ i, len: Math.hypot(pt.x - r.points[i]!.x, pt.y - r.points[i]!.y) }))
          .sort((a, b) => b.len - a.len);
        let repaired = false;
        for (const { i } of segIndices) {
          const cands = slidingLabelCandidates(
            r.points[i]!,
            r.points[i + 1]!,
            lbl.width,
            lbl.height,
            otherRoutes.map((o) => o.points),
            8,
          );
          for (const c of cands) {
            const testBox: Rect = { id: lbl.id, x: c.x, y: c.y, width: lbl.width, height: lbl.height };
            if (!overlapsBoxOrLabel(testBox) && !masksOtherRoute(testBox)) {
              lbl.x = c.x;
              lbl.y = c.y;
              repaired = true;
              break;
            }
          }
          if (repaired) break;
        }
      }
    }

    // Tighten boundary padding and compact over-stretched external node wires in C4 Component / Container views
    if (groups.length === 1) {
      const grp = groups[0]!;
      const ownerId = grp.id.slice("boundary_".length);
      const childRects = rects.filter((r) => groupOf.get(r.id) === ownerId);
      const extRects = rects.filter((r) => !groupOf.has(r.id));
      if (childRects.length > 0 && extRects.length > 0) {
        const minChildX = Math.min(...childRects.map((c) => c.x));
        const maxChildRight = Math.max(...childRects.map((c) => c.x + c.width));
        const desiredGrpLeft = minChildX - 28;
        const desiredGrpRight = maxChildRight + 28;
        if (desiredGrpLeft > grp.x) {
          grp.width -= desiredGrpLeft - grp.x;
          grp.x = desiredGrpLeft;
        }
        if (grp.x + grp.width > desiredGrpRight) {
          grp.width = desiredGrpRight - grp.x;
        }

        const leftExt = extRects.filter((r) => r.x + r.width <= grp.x);
        if (leftExt.length > 0) {
          const maxLeftExtRight = Math.max(...leftExt.map((r) => r.x + r.width));
          const targetGap = 156;
          const shiftX = Math.round(grp.x - targetGap - maxLeftExtRight);
          if (shiftX > 24) {
            const snapshotRects = rects.map((r) => ({ ...r }));
            const snapshotRoutes = routes.map((r) => ({
              ...r,
              points: r.points.map((p) => ({ ...p })),
            }));
            const snapshotLabels = labels.map((l) => ({ ...l }));
            const curQ = inspectGeometry(rects, labels, routes);

            const leftIds = new Set(leftExt.map((r) => r.id));
            for (const r of leftExt) r.x += shiftX;
            for (const route of routes) {
              if (!leftIds.has(route.from) && !leftIds.has(route.to)) continue;
              route.points = route.points.map((pt, idx) => {
                if (idx === 0 && leftIds.has(route.from)) return { x: pt.x + shiftX, y: pt.y };
                if (idx === route.points.length - 1 && leftIds.has(route.to))
                  return { x: pt.x + shiftX, y: pt.y };
                if (pt.x <= maxLeftExtRight + 24) return { x: pt.x + shiftX, y: pt.y };
                return pt;
              });
              const lbl = labels.find((l) => l.id === route.id);
              if (lbl && route.points.length === 2) {
                const x1 = Math.min(route.points[0]!.x, route.points[1]!.x);
                const x2 = Math.max(route.points[0]!.x, route.points[1]!.x);
                lbl.x = Math.round((x1 + x2 - lbl.width) / 2);
              } else if (lbl && lbl.x <= maxLeftExtRight + 80) {
                lbl.x += shiftX;
              }
            }
            const nextQ = inspectGeometry(rects, labels, routes);
            if (nextQ.needsReview || nextQ.crossings > curQ.crossings) {
              rects.splice(0, rects.length, ...snapshotRects);
              routes.splice(0, routes.length, ...snapshotRoutes);
              labels.splice(0, labels.length, ...snapshotLabels);
            }
          }
        }

        const rightExt = extRects.filter((r) => r.x >= grp.x + grp.width);
        if (rightExt.length > 0) {
          const minRightExtLeft = Math.min(...rightExt.map((r) => r.x));
          const targetGap = 156;
          const shiftX = Math.round(minRightExtLeft - (grp.x + grp.width + targetGap));
          if (shiftX > 24) {
            const snapshotRects = rects.map((r) => ({ ...r }));
            const snapshotRoutes = routes.map((r) => ({
              ...r,
              points: r.points.map((p) => ({ ...p })),
            }));
            const snapshotLabels = labels.map((l) => ({ ...l }));
            const curQ = inspectGeometry(rects, labels, routes);

            const rightIds = new Set(rightExt.map((r) => r.id));
            for (const r of rightExt) r.x -= shiftX;
            const newRightExtLeft = minRightExtLeft - shiftX;
            for (const route of routes) {
              if (!rightIds.has(route.from) && !rightIds.has(route.to)) continue;
              route.points = route.points.map((pt, idx) => {
                if (idx === 0 && rightIds.has(route.from)) return { x: pt.x - shiftX, y: pt.y };
                if (idx === route.points.length - 1 && rightIds.has(route.to))
                  return { x: pt.x - shiftX, y: pt.y };
                if (pt.x >= minRightExtLeft - 24) return { x: pt.x - shiftX, y: pt.y };
                if (pt.x > grp.x + grp.width && pt.x < minRightExtLeft) {
                  const ratio =
                    (pt.x - (grp.x + grp.width)) /
                    Math.max(1, minRightExtLeft - (grp.x + grp.width));
                  return {
                    x: Math.round(grp.x + grp.width + ratio * (newRightExtLeft - (grp.x + grp.width))),
                    y: pt.y,
                  };
                }
                return pt;
              });
              const lbl = labels.find((l) => l.id === route.id);
              if (lbl) {
                if (route.points.length === 2) {
                  const x1 = Math.min(route.points[0]!.x, route.points[1]!.x);
                  const x2 = Math.max(route.points[0]!.x, route.points[1]!.x);
                  lbl.x = Math.round((x1 + (x2 - x1) * 0.55 - lbl.width / 2));
                } else if (lbl.x >= grp.x + grp.width - 20) {
                  lbl.x = Math.round(grp.x + grp.width + (newRightExtLeft - (grp.x + grp.width) - lbl.width) / 2);
                }
              }
            }
            const nextQ = inspectGeometry(rects, labels, routes);
            if (nextQ.needsReview || nextQ.crossings > curQ.crossings) {
              rects.splice(0, rects.length, ...snapshotRects);
              routes.splice(0, routes.length, ...snapshotRoutes);
              labels.splice(0, labels.length, ...snapshotLabels);
            } else if (graph.width) {
              graph.width = Math.max(520, graph.width - shiftX);
            }
          }
        }
      }
    }

    return {
      graph,
      rects,
      labels,
      routes,
      groups,
      quality: inspectGeometry(rects, labels, routes),
    };
  };
  if (doc.notation === "ARCHITECTURE_OVERVIEW")
    best =
      compactOverview(
        nodes.map((node) => ({
          ...node,
          width: graphs.get(node.id)!.width!,
          height: graphs.get(node.id)!.height!,
        })),
        edges,
      ) ?? undefined;
  for (
    let attempt = 0;
    attempt < 3 && !(doc.notation === "ARCHITECTURE_OVERVIEW" && best && !best.quality.needsReview);
    attempt++
  ) {
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
        "elk.spacing.nodeNode": String(52 + attempt * 24),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(96 + attempt * 36),
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "16",
        "elk.spacing.labelNode": "12",
        "elk.layered.spacing.edgeNodeBetweenLayers": "18",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "14",
        "elk.layered.mergeEdges": "false",
        "elk.padding": "[top=32,left=32,bottom=32,right=32]",
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
    offset = doc.notation === "ARCHITECTURE_OVERVIEW" ? { x: 24, y: 84 } : { x: 48, y: 112 };
  const contentWidth = best.graph.width ?? 0;
  const frameWidth =
    doc.notation === "ARCHITECTURE_OVERVIEW" ? 900 : Math.max(contentWidth, 520);
  const hasPinned = nodes.some((node) => Boolean(node["pinned"]));
  const contentOffsetX =
    offset.x +
    (!hasPinned && contentWidth > 0 && contentWidth < frameWidth
      ? Math.round((frameWidth - contentWidth) / 2)
      : 0);
  const quality = escape(JSON.stringify(best.quality));
  // Persist view semantics separately from geometry. Relayout reads these back instead of
  // reconstructing scope, provenance, or boundary types from labels and screen titles.
  const { layoutJson: _layoutJson, ...documentMetadata } = doc;
  const metadata = (record: Record<string, unknown>, keys: string[]) =>
    escape(JSON.stringify(Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]))));
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const geometry = (x: number, y: number, width: number, height: number) =>
    `<mxGeometry x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" as="geometry"/>`;
  const headerX =
    best.groups.length === 1 ? Math.max(offset.x, best.groups[0]!.x + contentOffsetX) : offset.x;
  cells.push(
    `<mxCell id="mavis_title" mavisSmartRouting="3" mavisDocument="${escape(JSON.stringify(documentMetadata))}" mavisRuleVersion="${RULE_VERSION}" mavisTheme="${theme}" mavisQuality="${quality}" mavisOmittedNodes="${Number(doc["omittedNodes"] ?? 0)}" mavisOmittedEdges="${Number(doc["omittedEdges"] ?? 0)}" value="${escape(doc["viewTitle"] ?? doc.notation + " · " + doc.level + (doc["scopeContainerId"] ? " · " + nodes.find((node) => node.id === doc["scopeContainerId"])?.name : " · overview"))}" style="text;html=0;fontFamily=Arial;fontSize=20;fontStyle=1;fontColor=${p.text};align=left;" vertex="1" parent="1">${geometry(headerX, 24, frameWidth, 36)}</mxCell>`,
  );
  cells.push(
    `<mxCell id="mavis_scope" value="${escape(`${doc["policyVersion"] ? "Semantic review required" : RULE_VERSION} · ${nodes.length} shapes · ${edges.length} displayed relationships`)}" style="text;html=0;fontFamily=Arial;fontSize=12;fontColor=${p.text};align=left;" vertex="1" parent="1">${geometry(headerX, 64, frameWidth, 28)}</mxCell>`,
  );
  for (const group of best.groups) {
    const owner = group.id.slice("boundary_".length);
    const ownerNode = nodes.find((node) => node.id === owner);
    const header = boundaryHeader(ownerNode!);
    cells.push(
      `<mxCell id="${safe(group.id)}" mavisId="${escape(owner)}" mavisName="${escape(ownerNode?.name ?? "Container")}" mavisKind="${escape(kindOf(ownerNode!))}" mavisTechnology="${escape(ownerNode?.languageStack ?? "")}" mavisDescription="${escape(ownerNode?.description ?? "")}" mavisProperties="${escape(JSON.stringify(ownerNode?.["properties"] ?? {}))}" mavisNodeMetadata="${metadata(ownerNode!, ["viewLocal", "underlyingNodeIds", "inference"])}" value="${escape(header.text)}" mavisRole="boundary" style="swimlane;horizontal=1;startSize=${header.height};rounded=1;dashed=1;fillColor=${p.background};swimlaneFillColor=${p.background};fontColor=${p.text};strokeColor=${p.border};fontFamily=Arial;fontSize=16;collapsible=0;${ownerNode?.["pinned"] ? "movable=0;resizable=0;rotatable=0;deletable=0;editable=0;locked=1;connectable=0;" : ""}" vertex="1" parent="1">${geometry(group.x + contentOffsetX, group.y + offset.y, group.width, group.height)}</mxCell>`,
    );
  }
  for (const node of nodes) {
    if (parents.has(node.id)) continue;
    const rect = best.rects.find((item) => item.id === node.id)!;
    const parent = groupOf.get(node.id);
    const group = parent ? best.groups.find((item) => item.id === "boundary_" + parent) : null;
    cells.push(
      `<mxCell id="${safe(node.id)}" value="${escape(nodeHtml(node))}" mavisId="${escape(node.id)}" mavisRole="${escape(kindOf(node))}" mavisName="${escape(node.name)}" mavisTechnology="${escape(node.languageStack ?? "")}" mavisDescription="${escape(node.description ?? "")}" mavisProperties="${escape(node["properties"] && Object.keys(node["properties"]).length ? JSON.stringify(node["properties"]) : "")}" mavisNodeMetadata="${metadata(node, ["viewLocal", "underlyingNodeIds", "inference"])}" style="${nodeStyle(kindOf(node), theme).replace("html=0", "html=1")}${node["pinned"] ? "movable=0;resizable=0;rotatable=0;deletable=0;editable=0;locked=1;connectable=0;" : ""}" vertex="1" parent="${group ? safe(group.id) : "1"}">${geometry(rect.x + (group ? -group.x : contentOffsetX), rect.y + (group ? -group.y : offset.y), rect.width, rect.height)}</mxCell>`,
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
      .map((point) => `<mxPoint x="${n(point.x + contentOffsetX)}" y="${n(point.y + offset.y)}"/>`)
      .join("");
    const jumpStyle = best.quality.crossings > 0 ? "jumpStyle=arc;jumpSize=6;" : "";
    cells.push(
      `<mxCell id="${safe(edge.id)}" value="" mavisId="${escape(edge.id)}" mavisRole="edge" mavisRelationType="${escape(edge.relationType ?? edge.type ?? "")}" mavisOriginLayer="${escape(edge.originLayer ?? "")}" mavisEdgeMetadata="${metadata(edge, ["underlyingEdgeIds", "resolutionStatus", "uncertain", "direction"])}" style="edgeStyle=none;orthogonal=1;rounded=0;${jumpStyle}endArrow=block;endFill=1;strokeWidth=1.5;strokeColor=${p.line};dashed=${declared ? 1 : 0};exitX=${out.x};exitY=${out.y};exitPerimeter=0;entryX=${input.x};entryY=${input.y};entryPerimeter=0;" edge="1" parent="1" source="${safe(parents.has(route.from) ? "boundary_" + route.from : route.from)}" target="${safe(parents.has(route.to) ? "boundary_" + route.to : route.to)}"><mxGeometry relative="1" as="geometry"><Array as="points">${points}</Array></mxGeometry></mxCell>`,
    );
    if (label)
      cells.push(
        `<mxCell id="label_${safe(edge.id)}" value="${escape(labelText(edge))}" mavisRole="edge-label" mavisEdgeId="${escape(edge.id)}" style="text;html=0;fontFamily=Arial;fontSize=13;fontColor=${p.text};fillColor=none;strokeColor=none;whiteSpace=wrap;spacing=4;align=center;verticalAlign=middle;" vertex="1" parent="1">${geometry(label.x + contentOffsetX, label.y + offset.y, label.width, label.height)}</mxCell>`,
      );
  }
  const bottom = (best.graph.height ?? 0) + offset.y + 36;
  const legendWrapCols =
    doc.notation === "ARCHITECTURE_OVERVIEW" || frameWidth >= 850
      ? 105
      : Math.max(65, Math.floor(frameWidth / 8.5));
  const legendLines =
    doc.notation === "ARCHITECTURE_OVERVIEW"
      ? [
          "ARCHITECTURE OVERVIEW LEGEND",
          "• Element Groups: Lists services, message channels, and data stores grouped by architectural tier.",
          "• Directed Edges (───►): Static source or deployment-declared dependencies (does not imply live runtime traffic).",
        ]
      : [
          `NOTATION LEGEND (${doc.notation} · ${doc.level}) — ${nodes.length} elements · ${edges.length} relationships`,
          "• Elements: Dashed frame = System / Container Boundary  |  Rectangle = Service / Component  |  Cylinder = Database  |  Pipe = Message Channel",
          "• Relationships: Solid arrow (───►) = Source-inferred dependency  |  Dashed arrow (- - ►) = Declared configuration (Compose / Deployment)",
          ...(typeof doc["scopeWarning"] === "string" && doc["scopeWarning"].trim()
            ? wrapText(`• Scope note: ${doc["scopeWarning"].trim()}`, legendWrapCols)
            : []),
        ];
  const legendWidth = Math.min(920, frameWidth);
  const legendX =
    best.groups.length === 1
      ? Math.max(
          offset.x,
          Math.round(best.groups[0]!.x + contentOffsetX + (best.groups[0]!.width - legendWidth) / 2),
        )
      : offset.x;
  const legendHeight = Math.max(64, legendLines.length * 17 + 24);
  cells.push(
    `<mxCell id="mavis_legend" value="${escape(legendLines.join("\n"))}" mavisRole="legend" style="rounded=1;arcSize=6;dashed=1;html=0;fontFamily=Arial;fontSize=12;fontColor=${p.text};fillColor=${p.background};strokeColor=${p.border};whiteSpace=wrap;align=left;verticalAlign=middle;spacing=12;" vertex="1" parent="1">${geometry(legendX, bottom, legendWidth, legendHeight)}</mxCell>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="MAVIS" agent="MAVIS" version="1"><diagram id="${escape(doc["diagramId"] ?? doc.modelVersionId)}" name="${escape(doc.notation + " · " + doc.level)}"><mxGraphModel mavisSmartRouting="3" mavisDocument="${escape(JSON.stringify(documentMetadata))}" mavisModelId="${escape(doc.modelVersionId)}" mavisViewId="${escape(doc["viewId"] ?? "")}" mavisSemanticStatus="${doc["policyVersion"] ? "requires-review" : "unassessed"}" mavisRuleVersion="${RULE_VERSION}" mavisTheme="${theme}" mavisQuality="${quality}" mavisContainerId="${escape(doc["scopeContainerId"] ?? "")}" grid="0" gridSize="16" page="0" background="${p.background}" connect="1" arrows="1" math="0" shadow="0"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}

