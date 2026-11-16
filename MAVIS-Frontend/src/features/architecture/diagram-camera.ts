export type DiagramCamera = { x: number; y: number; zoom: number };
export function zoomDiagramCamera(
  camera: DiagramCamera,
  factor: number,
  anchor: { x: number; y: number },
  origin: { x: number; y: number },
): DiagramCamera {
  const zoom = Math.max(0.15, Math.min(12, camera.zoom * factor));
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: anchor.x - origin.x - (anchor.x - origin.x - camera.x) * ratio,
    y: anchor.y - origin.y - (anchor.y - origin.y - camera.y) * ratio,
  };
}
