"use client";
import { useEffect, useId, useRef, useState } from "react";
import { zoomDiagramCamera, type DiagramCamera } from "./diagram-camera";
import { assessReadability, minimumSvgFont } from "@/lib/architecture/readability";
import { svgHitTargets, type DiagramHit } from "./diagram-selection";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { renderDiagram, type DiagramFormat, type DrawingStyle } from "./diagram-renderer";
export function DiagramPreview({
  content,
  format,
  style,
  title,
  svg,
  semanticXml,
  onSelect,
  selectedId,
}: {
  content: string;
  format: DiagramFormat;
  style: DrawingStyle;
  title: string;
  svg?: string;
  semanticXml?: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const { t } = useLocale();
  const [result, setResult] = useState<{
    url: string;
    width: number;
    height: number;
    minimumFontPx: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [hits, setHits] = useState<DiagramHit[]>([]);
  const [camera, setCamera] = useState<DiagramCamera>({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    moved: boolean;
    selection?: string | undefined;
  } | null>(null);
  const instructions = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const graphical = !!svg || format === "MERMAID" || format === "PLANTUML";
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
    if (!svg && format !== "MERMAID" && format !== "PLANTUML") return;
    let live = true;
    let objectUrl: string | undefined;
    void (
      svg ? Promise.resolve(svg) : renderDiagram(content, format as "MERMAID" | "PLANTUML", style)
    )
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
        const minimumFontPx = minimumSvgFont(root);
        setResult({
          url: objectUrl,
          width: w,
          height: h,
          minimumFontPx,
        });
      })
      .catch((cause) => {
        if (live)
          setError(
            t(
              `Diagram could not render: ${cause instanceof Error ? cause.message.slice(0, 220) : "unknown renderer error"}`,
              `Không thể hiển thị sơ đồ: ${cause instanceof Error ? cause.message.slice(0, 220) : "lỗi kết xuất"}`,
            ),
          );
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [content, format, style, svg]);
  const readability = result
    ? assessReadability({
        width: result.width,
        height: result.height,
        minimumFontPx: result.minimumFontPx,
        viewportWidth: Math.max(1, width),
        viewportHeight: 620,
      })
    : null;
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
      aria-label={t("Selected diagram preview", "Xem trước sơ đồ đã chọn")}
      data-format={svg ? "DRAWIO_SVG" : format}
      data-style={style}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className="text-sm font-semibold">
          {title}
          {!svg ? ` · ${format}` : ""}
        </h2>
        {graphical && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-label={t("Zoom in", "Phóng to")}
              onClick={() => zoomAtCenter(1.2)}
            >
              +
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={t("Zoom out", "Thu nhỏ")}
              onClick={() => zoomAtCenter(1 / 1.2)}
            >
              −
            </Button>
            <Button size="sm" variant="outline" onClick={resetCamera}>
              {t("Fit diagram", "Vừa khung")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void (
                  document.fullscreenElement
                    ? document.exitFullscreen()
                    : viewport.current
                        ?.closest("[data-architecture-workspace]")
                        ?.requestFullscreen()
                )?.catch(() => {});
              }}
            >
              {t("Fullscreen", "Toàn màn hình")}
            </Button>
          </div>
        )}
      </div>
      {svg && semanticXml && (
        <iframe
          title="Diagram shape measurement"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none fixed -left-[10000px] top-0 h-[1200px] w-[2400px]"
          sandbox="allow-same-origin"
          srcDoc={svg}
          onLoad={(event) => {
            const root = event.currentTarget.contentDocument?.querySelector("svg");
            if (root) setHits(svgHitTargets(root as SVGSVGElement, semanticXml));
          }}
        />
      )}
      {svg && readability && (
        <details className="border-b px-4 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {t("Readability details", "Chi tiết độ dễ đọc")}
          </summary>
          <p>
            At fit: smallest text approximately {readability.minimumScreenFontPx.toFixed(1)}px · A3
            landscape: {readability.minimumA3FontPt.toFixed(1)}pt.{" "}
            {!readability.screenReadable && "Use a detail view for reading individual labels."}{" "}
            {!readability.printReadable && "Choose a narrower view before printing."}
          </p>
        </details>
      )}
      <div
        ref={viewport}
        className={`relative h-[620px] ${graphical ? `touch-none select-none overflow-hidden ${dragging ? "cursor-grabbing" : "cursor-grab"}` : "overflow-auto"}`}
        role={graphical ? "region" : undefined}
        aria-label={graphical ? t("Diagram canvas", "Vùng hiển thị sơ đồ") : undefined}
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
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false,
            selection:
              (event.target as Element)
                .closest("[data-semantic-id]")
                ?.getAttribute("data-semantic-id") ?? undefined,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x;
          const dy = event.clientY - previous.y;
          if (!previous.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          drag.current = { ...previous, x: event.clientX, y: event.clientY, moved: true };
          setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          if (!drag.current.moved && drag.current.selection) onSelect?.(drag.current.selection);
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
          if (!graphical || event.target !== event.currentTarget) return;
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
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: imageWidth,
                height: imageHeight,
                transform: `translate(${originX + camera.x}px,${originY + camera.y}px) scale(${camera.zoom})`,
              }}
            >
              <img
                src={result.url}
                alt={`${title} rendered with ${format}`}
                width={imageWidth}
                height={imageHeight}
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 block max-w-none origin-top-left"
              />
              {onSelect &&
                hits.map((hit, index) => (
                  <button
                    key={`${hit.cellId}:${index}`}
                    type="button"
                    data-semantic-id={hit.id}
                    aria-label={`Select ${hit.label}`}
                    aria-pressed={selectedId === hit.id}
                    onClick={(event) => {
                      if (event.detail === 0) onSelect(hit.id);
                    }}
                    className="absolute cursor-pointer rounded-sm border-2 border-transparent bg-transparent hover:border-blue-400 focus-visible:border-blue-600 focus-visible:outline-none"
                    style={{
                      left: hit.x * fit,
                      top: hit.y * fit,
                      width: hit.width * fit,
                      height: hit.height * fit,
                      ...(selectedId === hit.id
                        ? { borderColor: "#2563eb", background: "#2563eb0d" }
                        : {}),
                    }}
                  />
                ))}
            </div>
          ) : (
            <p role="status" className="p-5 text-sm text-slate-500">
              {t(`Rendering ${format} diagram…`, `Đang hiển thị sơ đồ ${format}…`)}
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
          {t(
            "Drag to pan · Scroll to zoom at cursor · Arrow keys to pan · + / − to zoom · 0 or double-click to fit",
            "Kéo để di chuyển · Cuộn để phóng to/thu nhỏ · Phím mũi tên để di chuyển · + / − để phóng to/thu nhỏ · Nhấn 0 hoặc nhấp đúp để vừa khung",
          )}
        </p>
      )}
      {graphical && !svg && (
        <details className="border-t p-4">
          <summary className="cursor-pointer text-sm">
            {t(`View ${format} source`, `Xem mã nguồn ${format}`)}
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto text-xs">
            <code>{content}</code>
          </pre>
        </details>
      )}
      {!graphical && (
        <p className="border-t p-4 text-xs text-muted-foreground">
          {format === "DRAWIO_XML"
            ? t(
                "Draw.io XML is an editable document format. Download and open it in diagrams.net to edit the drawing.",
                "Draw.io XML là định dạng sơ đồ có thể chỉnh sửa. Tải về và mở bằng diagrams.net nếu cần xem hoặc chỉnh sửa.",
              )
            : t(
                "JSON shows the selected diagram's structured data.",
                "Tệp JSON chứa dữ liệu cấu trúc của sơ đồ được chọn.",
              )}
        </p>
      )}
    </section>
  );
}
