"use client";
import { useEffect, useId, useRef, useState } from "react";
import { zoomDiagramCamera, type DiagramCamera } from "./diagram-camera";
import { Button } from "@/components/ui/button";
import { renderDiagram, type DiagramFormat, type DrawingStyle } from "./diagram-renderer";
export function DiagramPreview({
  content,
  format,
  style,
  title,
}: {
  content: string;
  format: DiagramFormat;
  style: DrawingStyle;
  title: string;
}) {
  const [result, setResult] = useState<{ url: string; width: number; height: number } | null>(null);
  const [error, setError] = useState("");
  const [camera, setCamera] = useState<DiagramCamera>({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const instructions = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const graphical = format === "MERMAID" || format === "PLANTUML";
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (format !== "MERMAID" && format !== "PLANTUML") return;
    let live = true;
    let objectUrl: string | undefined;
    void renderDiagram(content, format, style)
      .then((svg) => {
        if (!live) return;
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        let root: Element = doc.documentElement;
        if (doc.querySelector("parsererror")) {
          const htmlSvg = new DOMParser().parseFromString(svg, "text/html").querySelector("svg");
          if (htmlSvg) root = htmlSvg;
        }
        if (root.localName !== "svg") throw new Error("Renderer returned an invalid SVG");
        const box = root.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
        const w = box?.[2] || parseFloat(root.getAttribute("width") ?? "900");
        const h = box?.[3] || parseFloat(root.getAttribute("height") ?? "600");
        objectUrl = URL.createObjectURL(
          new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" }),
        );
        setResult({ url: objectUrl, width: w, height: h });
      })
      .catch((cause) => {
        if (live)
          setError(
            `Diagram could not render: ${cause instanceof Error ? cause.message.slice(0, 220) : "unknown renderer error"}`,
          );
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [content, format, style]);
  const fit = result ? Math.min(width / result.width, 620 / result.height, 1) : 1;
  const imageWidth = result ? result.width * fit : 0;
  const imageHeight = result ? result.height * fit : 0;
  const originX = (width - imageWidth) / 2;
  const originY = (620 - imageHeight) / 2;
  function zoomAtCenter(factor: number) {
    setCamera((current) =>
      zoomDiagramCamera(current, factor, { x: width / 2, y: 310 }, { x: originX, y: originY }),
    );
  }
  function resetCamera() {
    setCamera({ x: 0, y: 0, zoom: 1 });
  }
  useEffect(() => {
    const element = viewport.current;
    if (!element || !graphical || !result) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 620 : 1;
      const factor = Math.exp(-Math.max(-300, Math.min(300, event.deltaY * unit)) * 0.003);
      setCamera((current) =>
        zoomDiagramCamera(
          current,
          factor,
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          { x: originX, y: originY },
        ),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [graphical, result, originX, originY]);
  let text = content;
  if (format === "JSON") {
    try {
      text = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      /* show original */
    }
  }
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Selected diagram preview"
      data-format={format}
      data-style={style}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className="text-sm font-semibold">
          {title} · {format}
        </h2>
        {graphical && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-label="Zoom in"
              onClick={() => zoomAtCenter(1.2)}
            >
              +
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Zoom out"
              onClick={() => zoomAtCenter(1 / 1.2)}
            >
              −
            </Button>
            <Button size="sm" variant="outline" onClick={resetCamera}>
              Fit diagram
            </Button>
          </div>
        )}
      </div>
      <div
        ref={viewport}
        className={`relative h-[620px] ${graphical ? `touch-none select-none overflow-hidden ${dragging ? "cursor-grabbing" : "cursor-grab"}` : "overflow-auto"}`}
        role={graphical ? "region" : undefined}
        aria-label={graphical ? "Diagram canvas" : undefined}
        aria-describedby={graphical ? instructions : undefined}
        tabIndex={graphical ? 0 : undefined}
        data-zoom={graphical ? camera.zoom : undefined}
        data-pan-x={graphical ? camera.x : undefined}
        data-pan-y={graphical ? camera.y : undefined}
        onPointerDown={(event) => {
          if (!graphical || !result || event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x;
          const dy = event.clientY - previous.y;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => {
          if (graphical) resetCamera();
        }}
        onKeyDown={(event) => {
          if (!graphical) return;
          const movement: Record<string, [number, number]> = {
            ArrowLeft: [-40, 0],
            ArrowRight: [40, 0],
            ArrowUp: [0, -40],
            ArrowDown: [0, 40],
          };
          const delta = movement[event.key];
          if (delta) {
            event.preventDefault();
            setCamera((current) => ({
              ...current,
              x: current.x + delta[0],
              y: current.y + delta[1],
            }));
          } else if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomAtCenter(1.2);
          } else if (event.key === "-") {
            event.preventDefault();
            zoomAtCenter(1 / 1.2);
          } else if (event.key === "0" || event.key === "Home") {
            event.preventDefault();
            resetCamera();
          }
        }}
        style={{
          background: style === "dark" ? "#161b22" : style === "blueprint" ? "#082032" : "#fff",
        }}
      >
        {graphical ? (
          error ? (
            <p role="alert" className="p-5 text-sm text-destructive">
              {error}
            </p>
          ) : result ? (
            // SVG is displayed as an image, isolated from the application's DOM.
            <img
              src={result.url}
              alt={`${title} rendered with ${format}`}
              width={imageWidth}
              height={imageHeight}
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 block max-w-none origin-top-left"
              style={{
                transform: `translate(${originX + camera.x}px, ${originY + camera.y}px) scale(${camera.zoom})`,
              }}
            />
          ) : (
            <p role="status" className="p-5 text-sm text-slate-500">
              Rendering {format} diagram…
            </p>
          )
        ) : (
          <pre
            className="p-5 text-xs"
            style={{ color: style === "clean" ? "#0f172a" : "#e0f2fe" }}
            aria-label={`${format} diagram source`}
          >
            <code>{text}</code>
          </pre>
        )}
      </div>
      {graphical && (
        <p id={instructions} className="border-t px-4 py-2 text-xs text-muted-foreground">
          Drag to pan · Scroll to zoom at cursor · Arrow keys to pan · + / − to zoom · 0 or
          double-click to fit
        </p>
      )}
      {graphical && (
        <details className="border-t p-4">
          <summary className="cursor-pointer text-sm">View {format} source</summary>
          <pre className="mt-3 max-h-80 overflow-auto text-xs">
            <code>{content}</code>
          </pre>
        </details>
      )}
      {!graphical && (
        <p className="border-t p-4 text-xs text-muted-foreground">
          {format === "DRAWIO_XML"
            ? "Draw.io XML is an editable document format. Download and open it in diagrams.net to edit the drawing."
            : "JSON shows the selected diagram's structured data."}
        </p>
      )}
    </section>
  );
}
