import { layoutGraph } from "./graph-layout";
import type { ServiceOverviewProjection } from "./service-overview";
export const SERVICE_WIDTH = 210;
export const SERVICE_HEIGHT = 78;

// Layout consumes topology only: connection UI keys are never canonical edges.
export function serviceOverviewPositions(projection: ServiceOverviewProjection, aspectRatio = 2) {
  const elements = projection.services;
  if (!elements.length) return new Map<string, { x: number; y: number }>();
  const positions =
    elements.length > 150
      ? elements.map((service, index) => ({
          ...service,
          x: (index % Math.ceil(Math.sqrt(elements.length * aspectRatio))) * 280,
          y: Math.floor(index / Math.ceil(Math.sqrt(elements.length * aspectRatio))) * 150,
        }))
      : layoutGraph({
          elements,
          edges: projection.connections.map((connection) => ({
            from: connection.serviceIds[0],
            to: connection.serviceIds[1],
          })),
        });
  const points = positions.map((node) => ({
    id: node.id,
    x: node.x * 1.5 + SERVICE_WIDTH / 2,
    y: node.y * 1.5 + SERVICE_HEIGHT / 2,
  }));
  const minX = Math.min(...points.map((node) => node.x)),
    minY = Math.min(...points.map((node) => node.y));
  const width = Math.max(...points.map((node) => node.x)) - minX + SERVICE_WIDTH;
  const height = Math.max(...points.map((node) => node.y)) - minY + SERVICE_HEIGHT;
  const target = Math.max(0.5, Math.min(3, aspectRatio));
  const sx = Math.max(1, (target * height) / width),
    sy = Math.max(1, width / (target * height));
  return new Map(
    points.map((node) => [
      node.id,
      { x: (node.x - minX) * sx + SERVICE_WIDTH / 2, y: (node.y - minY) * sy + SERVICE_HEIGHT / 2 },
    ]),
  );
}
