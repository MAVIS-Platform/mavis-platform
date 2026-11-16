import type { Core, EdgeSingular, NodeSingular, Position } from "cytoscape";

export function pulseControls(
  edge: Pick<EdgeSingular, "controlPoints">,
  zoom: number,
  pan: Position,
) {
  // A lone edge with curve-style=bezier may be rendered as a straight line.
  // Cytoscape's renderedControlPoints() calls .map() on undefined in that case.
  // Read the optional model-space points first, then transform them ourselves.
  return (edge.controlPoints() ?? []).map((p) => ({
    x: p.x * zoom + pan.x,
    y: p.y * zoom + pan.y,
  }));
}

export function pulsePoint(
  start: Position,
  end: Position,
  controls: Position[],
  t: number,
): Position {
  const u = 1 - t;
  if (controls.length >= 2) {
    const [a, b] = controls as [Position, Position];
    return {
      x: u * u * u * start.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * end.y,
    };
  }
  if (controls.length === 1) {
    const a = controls[0]!;
    return {
      x: u * u * start.x + 2 * u * t * a.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * a.y + t * t * end.y,
    };
  }
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

// Draw only on a pointer-transparent overlay. Geometry comes from Cytoscape on
// every frame, so pulses follow curved/parallel edges and a moving camera.
export function startNetworkPulse(cy: Core, sourceId: string, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const node = cy
    .nodes()
    .filter((n) => n.data("sourceId") === sourceId)
    .first() as NodeSingular;
  if (!context || motion.matches || node.empty()) return () => {};
  const edges = node.connectedEdges().slice(0, 60);
  let frame = 0,
    started: number | undefined,
    stopped = false;
  const clear = () => context.clearRect(0, 0, canvas.width, canvas.height);
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    clear();
    motion.removeEventListener("change", stop);
  };
  motion.addEventListener("change", stop);
  const draw = (now: number) => {
    if (stopped || cy.destroyed()) {
      stop();
      return;
    }
    started ??= now;
    const progress = (now - started) / 1500;
    if (progress >= 1) {
      stop();
      return;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const fade = Math.min(1, (1 - progress) * 4);
    const color = String(node.data("exploreColor") ?? "#a78bfa");
    const center = node.renderedPosition();
    context.save();
    context.globalAlpha = (1 - progress) * 0.7;
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.shadowColor = color;
    context.shadowBlur = 15;
    context.beginPath();
    context.arc(center.x, center.y, 8 + progress * 65, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    edges.forEach((edge) => {
      const start = edge.renderedSourceEndpoint(),
        end = edge.renderedTargetEndpoint();
      if (!start || !end) return;
      const controls = pulseControls(edge, cy.zoom(), cy.pan());
      const edgeColor = String(edge.data("exploreColor") ?? color);
      for (const delay of [0, 0.24]) {
        const t = (progress - delay) * 1.55;
        if (t < 0 || t > 1) continue;
        context.save();
        context.lineCap = "round";
        context.strokeStyle = edgeColor;
        context.shadowColor = edgeColor;
        context.shadowBlur = 12;
        context.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const a = pulsePoint(start, end, controls, Math.max(0, t - i * 0.009));
          const b = pulsePoint(start, end, controls, Math.max(0, t - (i + 1) * 0.009));
          context.globalAlpha = fade * (1 - i / 12);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
        const head = pulsePoint(start, end, controls, t);
        context.globalAlpha = fade;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(head.x, head.y, 2.3, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    });
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return stop;
}
