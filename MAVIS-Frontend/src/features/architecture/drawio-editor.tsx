"use client";

import { useRef, useState } from "react";
import { Download, Maximize2, Save } from "lucide-react";
import type { DrawioTheme } from "@/lib/drawio/rules";
import { Button } from "@/components/ui/button";
import {
  ArchitectureSvgViewer,
  renderDiagramXmlToSvgString,
} from "./architecture-svg-viewer";

export { ArchitectureSvgViewer as MxGraphNativeSvgPreview };

/**
 * Pure native SVG diagram surface (replaces legacy embedded Draw.io iframe).
 * Preserves the DrawioEditor export signature for existing architecture & UML callers
 * without loading any external Draw.io iframe or third-party embed.
 */
export function DrawioEditor({
  xml,
  title,
  onSave,
  generatedXml,
  selectedId,
  onSelect,
}: {
  xml: string;
  modelId: string;
  diagramId: string;
  title: string;
  notation?: string | undefined;
  level?: string | undefined;
  scope?: string;
  theme?: DrawioTheme;
  onThemeChange?: ((theme: DrawioTheme) => void) | undefined;
  onSave?: (xml: string) => Promise<void>;
  onDraftChange?: ((xml: string) => void) | undefined;
  onRelayout?: (() => void) | undefined;
  generatedXml?: string;
  preferProvidedXml?: boolean;
  autoSaveWhenReady?: boolean;
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const container = useRef<HTMLElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeXml = xml || generatedXml || "";

  const handleDownloadSvg = () => {
    const isDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");
    const svg = renderDiagramXmlToSvgString(activeXml, isDark);
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "architecture"}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSave = async () => {
    if (!onSave || !activeXml) return;
    setSaving(true);
    setError("");
    try {
      await onSave(activeXml);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save diagram snapshot.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      ref={container}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs [&:fullscreen]:bg-card"
      aria-label="Architecture diagram viewer"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={!activeXml}
            onClick={handleDownloadSvg}
          >
            <Download className="mr-1.5 size-3.5" aria-hidden="true" />
            SVG
          </Button>
          {onSave && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              disabled={saving || !activeXml}
              onClick={() => void handleSave()}
            >
              <Save className="mr-1.5 size-3.5" aria-hidden="true" />
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : container.current?.requestFullscreen();
              void action?.catch(() => setError("Fullscreen is unavailable in this browser."));
            }}
          >
            <Maximize2 className="mr-1.5 size-3.5" aria-hidden="true" />
            Fullscreen
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <ArchitectureSvgViewer
        xml={activeXml}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </section>
  );
}
