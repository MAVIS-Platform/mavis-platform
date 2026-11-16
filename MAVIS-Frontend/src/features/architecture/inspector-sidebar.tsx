"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const widthPreference = "mavis.inspector.width";
export function InspectorSidebar({
  children,
  onClose,
  label = "Architecture Inspector · 3E",
}: {
  children: ReactNode;
  onClose: () => void;
  label?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(520);
  const [availableWidth, setAvailableWidth] = useState(1200);
  const [desktop, setDesktop] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const maximum = Math.max(320, Math.min(900, availableWidth - 320, availableWidth * 0.7));
  const minimum = Math.min(360, maximum);
  const currentWidth = Math.max(minimum, Math.min(maximum, width));
  const resize = (next: number) => {
    setExpanded(false);
    setWidth(Math.max(minimum, Math.min(maximum, next)));
  };
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(widthPreference));
      if (Number.isFinite(saved) && saved >= 320 && saved <= 900) setWidth(saved);
    } catch {
      /* Width remains adjustable when storage is unavailable. */
    }
    setReady(true);
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    const observer = new ResizeObserver((entries) =>
      setAvailableWidth(entries[0]?.contentRect.width ?? 1200),
    );
    if (panel.current?.parentElement) observer.observe(panel.current.parentElement);
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(widthPreference, String(width));
    } catch {
      /* Storage is optional. */
    }
  }, [width, ready]);
  return (
    <section
      ref={panel}
      aria-label="Inspector sidebar"
      className={`${!desktop ? "fixed inset-x-2 bottom-2 top-20 z-40" : expanded ? "absolute inset-0 z-30" : "relative h-full shrink-0"} flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card`}
      style={desktop ? { width: expanded ? "100%" : currentWidth } : undefined}
    >
      {desktop && !expanded && (
        <div
          role="separator"
          aria-label="Resize inspector"
          aria-orientation="vertical"
          aria-valuemin={minimum}
          aria-valuemax={maximum}
          aria-valuenow={currentWidth}
          tabIndex={0}
          className="group absolute inset-y-0 left-0 z-10 flex w-3 cursor-col-resize touch-none items-center justify-center hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onDoubleClick={() => resize(520)}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, width: currentWidth };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current) resize(drag.current.width + drag.current.x - event.clientX);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              resize(
                event.key === "Home"
                  ? 520
                  : event.key === "End"
                    ? maximum
                    : currentWidth + (event.key === "ArrowLeft" ? 40 : -40),
              );
            }
          }}
        >
          <span className="h-10 w-1 rounded-full bg-border group-hover:bg-muted-foreground" />
        </div>
      )}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b pl-5 pr-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          {desktop && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={expanded ? "Restore inspector size" : "Expand inspector"}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden pl-2">{children}</div>
    </section>
  );
}
