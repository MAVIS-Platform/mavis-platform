"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InspectorDock({
  children,
  onClose,
  label = "Architecture Inspector · 3E",
}: {
  children: ReactNode;
  onClose: () => void;
  label?: string;
}) {
  const dock = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(360);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const maximum = () => Math.max(280, (dock.current?.parentElement?.clientHeight ?? 700) - 280);
  const resize = (next: number) => {
    setCollapsed(false);
    setExpanded(false);
    setHeight(Math.max(240, Math.min(maximum(), next)));
  };
  useEffect(() => {
    const element = dock.current;
    if (window.matchMedia("(max-width: 767px)").matches) setExpanded(true);
    const observer = new ResizeObserver(() => setHeight((value) => Math.min(value, maximum())));
    if (element?.parentElement) observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={dock}
      aria-label="Inspector dock"
      className={`${expanded && !collapsed ? "absolute inset-0 z-30" : "relative"} flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-card`}
      style={{ height: collapsed ? 44 : expanded ? "100%" : height }}
    >
      <div
        role="separator"
        aria-label="Resize inspector"
        aria-orientation="horizontal"
        aria-valuemin={44}
        aria-valuemax={dock.current?.parentElement?.clientHeight ?? 700}
        aria-valuenow={
          collapsed ? 44 : expanded ? (dock.current?.parentElement?.clientHeight ?? 700) : height
        }
        tabIndex={0}
        className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onPointerDown={(event) => {
          drag.current = { y: event.clientY, height: dock.current?.clientHeight ?? height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) resize(drag.current.height + drag.current.y - event.clientY);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            resize(height + (event.key === "ArrowUp" ? 40 : -40));
          }
        }}
      >
        <span className="h-1 w-10 rounded-full bg-border group-hover:bg-muted-foreground" />
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b px-3">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={collapsed ? "Restore inspector" : "Collapse inspector"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={expanded ? "Restore inspector size" : "Expand inspector"}
            onClick={() => {
              setCollapsed(false);
              setExpanded(!expanded);
            }}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div hidden={collapsed} className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </section>
  );
}
