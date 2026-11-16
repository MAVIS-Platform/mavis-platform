export type DiagramHit = {
  cellId: string;
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export function xmlSemanticCells(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  const root = doc.querySelector("mxGraphModel");
  const isSequence =
    root?.getAttribute("mavisNotation") === "UML_SEQUENCE" ||
    !!doc.querySelector('[mavisRole="metadata-carrier"][mavisInteraction]');
  return Array.from(doc.querySelectorAll("[mavisId]")).flatMap((entry) => {
    const role = entry.getAttribute("mavisRole") ?? entry.getAttribute("mavisUmlRole");
    if (
      !role ||
      role === "edge-label" ||
      role === "legend" ||
      role === "metadata-carrier" ||
      role === "lifeline" ||
      role === "execution" ||
      role === "destruction" ||
      role === "fragment-operand" ||
      role === "activity-partition"
    ) {
      return [];
    }
    const isEdgeRole =
      role === "edge" ||
      role === "class-relation" ||
      role === "package-edge" ||
      role === "deployment-edge" ||
      role === "activity-edge" ||
      role === "state-transition" ||
      entry.getAttribute("edge") === "1";
    if (isEdgeRole && !isSequence) return [];
    const cell = entry.localName === "mxCell" ? entry : entry.querySelector("mxCell");
    const cellId = entry.getAttribute("id") ?? cell?.getAttribute("id");
    const id = isSequence
      ? (entry.getAttribute("mavisMessageId") ??
        entry.getAttribute("mavisFragmentId") ??
        entry.getAttribute("mavisInteractionUseId") ??
        entry.getAttribute("mavisParticipantId") ??
        entry.getAttribute("mavisId"))
      : entry.getAttribute("mavisId");
    return cellId && id
      ? [{ cellId, id, label: entry.getAttribute("mavisName") ?? id, role }]
      : [];
  });
}
export function svgHitTargets(root: SVGSVGElement, xml: string): DiagramHit[] {
  const map = new Map(xmlSemanticCells(xml).map((item) => [item.cellId, item]));
  const result: DiagramHit[] = [];
  const rootMatrix = root.getScreenCTM();
  if (!rootMatrix) return result;
  for (const cell of root.querySelectorAll<SVGGElement>("g[data-cell-id]")) {
    const entry = map.get(cell.getAttribute("data-cell-id") ?? "");
    if (!entry) continue;
    try {
      // foreignObject label wrappers can cover the entire SVG; measure the actual shape.
      const shape = cell.querySelector<SVGGraphicsElement>(
        ":scope > g > rect, :scope > g > path, :scope > g > ellipse, :scope > g > polygon",
      );
      if (!shape) continue;
      const box = shape.getBBox(),
        matrix = shape.getScreenCTM();
      if (!matrix) continue;
      const transform = rootMatrix.inverse().multiply(matrix);
      const corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
      const left = Math.min(...corners.map((p) => p.x)),
        right = Math.max(...corners.map((p) => p.x)),
        top = Math.min(...corners.map((p) => p.y)),
        bottom = Math.max(...corners.map((p) => p.y));
      const isEdge = entry.role === "edge";
      if (!isEdge && (box.width < 1 || box.height < 1)) continue;
      if (isEdge && box.width < 1 && box.height < 1) continue;
      const rawWidth = right - left;
      const rawHeight = bottom - top;
      const padY = isEdge && rawHeight < 14 ? (14 - rawHeight) / 2 : 0;
      const padX = isEdge && rawWidth < 14 ? (14 - rawWidth) / 2 : 0;
      result.push({
        cellId: entry.cellId,
        id: entry.id,
        label: entry.label,
        x: left - padX,
        y: top - padY,
        width: rawWidth + padX * 2,
        height: rawHeight + padY * 2,
      });
    } catch {
      /* A hidden or invalid shape cannot be selected. */
    }
  }
  return result.sort((a, b) => b.width * b.height - a.width * a.height);
}
