import { inspectGeometry, type Rect, type Route } from "./geometry";
import { ends, relationLabel, wrapText, type DiagramDocument } from "./rules";
export function compactOverview(
  nodes: {
    id: string;
    width: number;
    height: number;
    kind?: string | undefined;
    type?: string | undefined;
  }[],
  edges: DiagramDocument["layoutJson"]["edges"],
) {
  if (nodes.length !== 3) return null;
  const service = nodes.find((node) => (node.kind ?? node.type) === "SERVICE_GROUP"),
    channel = nodes.find((node) => (node.kind ?? node.type) === "CHANNEL_GROUP"),
    data = nodes.find((node) => (node.kind ?? node.type) === "DATASTORE_GROUP");
  if (!service || !channel || !data) return null;
  const measured = edges.map((edge) => {
    const lines = wrapText(relationLabel(edge), 24);
    return {
      id: edge.id,
      width: Math.max(...lines.map((line) => line.length)) * 7.5 + 16,
      height: lines.length * 17 + 10,
    };
  });
  const corridor = Math.max(180, ...measured.map((label) => label.width + 48));
  const right = 24 + service.width + corridor,
    totalHeight = channel.height + 48 + data.height;
  const app: Rect = { ...service, x: 24, y: 24 + Math.max(0, (totalHeight - service.height) / 2) };
  const queue: Rect = { ...channel, x: right, y: 24 },
    store: Rect = { ...data, x: right, y: 24 + channel.height + 48 };
  const rects = [app, queue, store],
    routes: Route[] = [],
    labels: Rect[] = [];
  for (const edge of edges) {
    const endpoint = ends(edge),
      label = measured.find((item) => item.id === edge.id)!;
    let points: Route["points"], labelY: number;
    if (endpoint.from === app.id && endpoint.to === queue.id) {
      const startY = app.y + app.height * 0.25,
        endY = queue.y + queue.height * 0.3,
        lane = app.x + app.width + 24;
      points = [
        { x: app.x + app.width, y: startY },
        { x: lane, y: startY },
        { x: lane, y: endY },
        { x: queue.x, y: endY },
      ];
      labelY = endY - label.height - 4;
    } else if (endpoint.from === queue.id && endpoint.to === app.id) {
      const startY = queue.y + queue.height * 0.7,
        endY = app.y + app.height * 0.5,
        lane = right - 24;
      points = [
        { x: queue.x, y: startY },
        { x: lane, y: startY },
        { x: lane, y: endY },
        { x: app.x + app.width, y: endY },
      ];
      labelY = endY + 4;
    } else if (endpoint.from === app.id && endpoint.to === store.id) {
      const startY = app.y + app.height * 0.8,
        endY = store.y + store.height * 0.5,
        lane = app.x + app.width + 24;
      points = [
        { x: app.x + app.width, y: startY },
        { x: lane, y: startY },
        { x: lane, y: endY },
        { x: store.x, y: endY },
      ];
      labelY = endY + 4;
    } else return null;
    routes.push({ id: edge.id, from: endpoint.from, to: endpoint.to, points });
    labels.push({ ...label, x: app.x + app.width + 32, y: labelY });
  }
  const quality = inspectGeometry(rects, labels, routes);
  if (quality.needsReview) return null;
  return {
    graph: {
      id: "root",
      width: Math.max(...rects.map((rect) => rect.x + rect.width)) + 24,
      height: Math.max(...rects.map((rect) => rect.y + rect.height)) + 24,
    },
    rects,
    labels,
    routes,
    groups: [] as Rect[],
    quality,
  };
}
