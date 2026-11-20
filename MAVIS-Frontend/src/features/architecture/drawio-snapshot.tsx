"use client";

import { useEffect } from "react";
import { renderDiagramXmlToSvgString } from "./architecture-svg-viewer";

/**
 * Pure client-side SVG snapshot exporter (zero embedded Draw.io iframe).
 */
export function DrawioSnapshot({
  xml,
  onRender,
  onError,
}: {
  xml: string;
  onRender: (svg: string) => void;
  onError: (error: string) => void;
}) {
  useEffect(() => {
    if (!xml) return;
    const isDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");
    const svg = renderDiagramXmlToSvgString(xml, isDark);
    if (svg) {
      onRender(svg);
    } else {
      onError("Could not render architecture diagram SVG.");
    }
  }, [xml, onRender, onError]);

  return null;
}
