"use client";
import { useEffect, useRef, useState } from "react";
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
  const [zoom, setZoom] = useState(1);
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
              onClick={() => setZoom((value) => Math.min(8, value * 1.2))}
            >
              +
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.25, value / 1.2))}
            >
              −
            </Button>
            <Button size="sm" variant="outline" onClick={() => setZoom(1)}>
              Fit diagram
            </Button>
          </div>
        )}
      </div>
      <div
        ref={viewport}
        className="h-[620px] overflow-auto"
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
              width={result.width * fit * zoom}
              height={result.height * fit * zoom}
              className="mx-auto block max-w-none"
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
