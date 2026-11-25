"use client";

import {
  formatSnapshotWatermark,
  serializeStudioGraph,
  type StudioSnapshotWatermark,
} from "./studio-observability";
import type { SmartSnapshotOverlay } from "./studio-smart-snapshot";

export type StudioVideoRecordingOptions = {
  watermark?: StudioSnapshotWatermark;
  smartOverlay?: SmartSnapshotOverlay;
};

export type StudioVideoRecordingResult = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  posterImageData?: string;
};

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not encode recorded video"));
    reader.onerror = () => reject(new Error("Could not read recorded video"));
    reader.readAsDataURL(blob);
  });
}

function drawRecordingHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  watermark?: StudioSnapshotWatermark,
  smartOverlay?: SmartSnapshotOverlay,
) {
  const padX = Math.max(12, Math.round(width * 0.015));
  const secs = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  // Compact top bar showing exercise type + live REC timer
  const topH = 34;
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.84)";
  ctx.fillRect(0, 0, width, topH);
  ctx.fillStyle = smartOverlay?.accentColor ?? "#0ea5e9";
  ctx.fillRect(0, 0, width, 2.5);

  ctx.textBaseline = "middle";
  const midTop = topH / 2 + 1;
  ctx.font = "700 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "left";
  const headerLeft = smartOverlay
    ? `${smartOverlay.badge} · ${smartOverlay.focusSummary}`
    : "MAVIS STUDIO LIVE RECORDING";
  ctx.fillText(headerLeft, padX, midTop, width * 0.72);

  // REC badge on top-right
  ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#fb7185";
  ctx.textAlign = "right";
  ctx.fillText(`● REC ${mm}:${ss}`, width - padX, midTop);

  // Bottom anti-cheating MSSV + timestamp bar
  if (watermark) {
    const { left, right } = formatSnapshotWatermark({
      ...watermark,
      capturedAt: new Date().toISOString(),
    });
    const barH = 30;
    const y = height - barH;
    ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
    ctx.fillRect(0, y, width, barH);
    ctx.fillStyle = "rgba(56, 189, 248, 0.55)";
    ctx.fillRect(0, y, width, 1.5);
    const midBot = y + barH / 2 + 0.5;
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "left";
    ctx.fillText(left, padX, midBot, width * 0.62);
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#7dd3fc";
    ctx.textAlign = "right";
    ctx.fillText(right, width - padX, midBot, width * 0.34);
  }
  ctx.restore();
}

/**
 * Records the REAL active Studio view: directly captures the Three.js WebGL 3D canvas at 15fps
 * (never the hidden fallback SVG) with live MSSV watermark and reliable VP8 WebM / MP4 playback.
 */
export function startStudioRecording(
  svg: SVGSVGElement,
  options?: StudioVideoRecordingOptions,
) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video recording is unavailable in this browser.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas recording is unavailable.");

  const styles = getComputedStyle(svg);
  const bgFill =
    styles.backgroundColor && styles.backgroundColor !== "rgba(0, 0, 0, 0)"
      ? styles.backgroundColor
      : "#f3f8ff";
  context.fillStyle = bgFill;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Prefer VP8 WebM first for universal Chrome/Edge playback & instant seeking without VP9 keyframe stalls.
  const mimeType = [
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp9",
    "video/webm",
    "video/mp4",
  ].find((type) => MediaRecorder.isTypeSupported(type));

  const stream = canvas.captureStream(15);
  const recorder = new MediaRecorder(
    stream,
    mimeType
      ? { mimeType, videoBitsPerSecond: 1_500_000 }
      : { videoBitsPerSecond: 1_500_000 },
  );

  const chunks: Blob[] = [];
  let timer = 0;
  let ended = false;
  let svgBusy = false;
  let posterImageData: string | undefined;
  const started = performance.now();

  const complete = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const effectiveType = recorder.mimeType || mimeType || "video/webm";
      resolve(new Blob(chunks, { type: effectiveType }));
    };
    recorder.onerror = () => reject(new Error("Video recording failed"));
  });

  function capturePosterSnapshot() {
    try {
      const webp = canvas.toDataURL("image/webp", 0.86);
      if (webp.startsWith("data:image/webp;base64,") && webp.length <= 420_000) {
        posterImageData = webp;
        return;
      }
      const png = canvas.toDataURL("image/png");
      if (png.length <= 420_000) posterImageData = png;
    } catch {
      // Ignore poster failure
    }
  }

  function drawWebglFrame(): boolean {
    const webglCanvas = svg.parentElement?.querySelector<HTMLCanvasElement>(
      "canvas[data-studio-webgl-canvas]",
    );
    const glCtx =
      webglCanvas?.getContext("webgl2") ?? webglCanvas?.getContext("webgl") ?? null;
    if (
      !webglCanvas ||
      webglCanvas.width <= 0 ||
      webglCanvas.height <= 0 ||
      webglCanvas.offsetParent === null ||
      glCtx?.isContextLost()
    ) {
      return false;
    }
    const typedCanvas = webglCanvas as HTMLCanvasElement & {
      __mavisRenderNow?: () => void;
      __mavisDrawLabels2D?: (
        ctx: CanvasRenderingContext2D,
        viewW: number,
        viewH: number,
        options?: {
          offsetX?: number | undefined;
          offsetY?: number | undefined;
          clipX?: number | undefined;
          clipY?: number | undefined;
          clipW?: number | undefined;
          clipH?: number | undefined;
          scale?: number | undefined;
        },
      ) => void;
    };
    typedCanvas.__mavisRenderNow?.();

    const topHudH = 34;
    const bottomHudH = options?.watermark ? 30 : 0;
    const stageX = 0;
    const stageY = topHudH;
    const stageW = canvas.width;
    const stageH = canvas.height - topHudH - bottomHudH;

    context!.fillStyle = bgFill;
    context!.fillRect(0, 0, canvas.width, canvas.height);
    context!.imageSmoothingEnabled = true;
    context!.imageSmoothingQuality = "high";

    const glW = webglCanvas.width;
    const glH = webglCanvas.height;
    const glAspect = glW / glH;
    const stageAspect = stageW / stageH;

    // When bottom drawer makes WebGL ultrawide, crop only empty outer horizontal margins (<= 16% per side)
    // so the 3D architecture fills the 1280x720 frame cleanly instead of shrinking into a thin ribbon.
    let sx = 0;
    let sw = glW;
    if (glAspect > stageAspect * 1.15) {
      const targetAspect = Math.max(stageAspect, glAspect * 0.68);
      sw = Math.min(glW, Math.round(glH * targetAspect));
      sx = Math.round((glW - sw) / 2);
    }
    const sy = 0;
    const sh = glH;

    const fitScale = Math.min(stageW / sw, stageH / sh);
    const dw = sw * fitScale;
    const dh = sh * fitScale;
    const dx = stageX + (stageW - dw) / 2;
    const dy = stageY + (stageH - dh) / 2;
    context!.drawImage(webglCanvas, sx, sy, sw, sh, dx, dy, dw, dh);

    // Exact affine projection matching the cropped/letterboxed WebGL rect so 1:1 vector tags align to the pixel.
    const projOriginX = dx - (sx / sw) * dw;
    const projOriginY = dy - (sy / sh) * dh;
    const projW = (glW / sw) * dw;
    const projH = (glH / sh) * dh;
    typedCanvas.__mavisDrawLabels2D?.(context!, projW, projH, {
      offsetX: projOriginX,
      offsetY: projOriginY,
      clipX: dx,
      clipY: dy,
      clipW: dw,
      clipH: dh,
      scale: Math.max(0.95, dw / 1280),
    });

    drawRecordingHud(
      context!,
      canvas.width,
      canvas.height,
      performance.now() - started,
      options?.watermark,
      options?.smartOverlay,
    );
    if (!posterImageData) capturePosterSnapshot();
    return true;
  }

  async function drawSvgFallbackFrame() {
    if (svgBusy || ended) return;
    svgBusy = true;
    let url = "";
    try {
      url = URL.createObjectURL(
        new Blob([serializeStudioGraph(svg, true, false)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = url;
      });
      if (!ended) {
        context!.fillStyle = bgFill;
        context!.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(
          canvas.width / (image.naturalWidth || canvas.width),
          canvas.height / (image.naturalHeight || canvas.height),
        );
        const w = (image.naturalWidth || canvas.width) * scale;
        const h = (image.naturalHeight || canvas.height) * scale;
        context!.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        drawRecordingHud(
          context!,
          canvas.width,
          canvas.height,
          performance.now() - started,
          options?.watermark,
          options?.smartOverlay,
        );
        if (!posterImageData) capturePosterSnapshot();
      }
    } catch {
      // Keep prior frame on transient redraw error
    } finally {
      if (url) URL.revokeObjectURL(url);
      svgBusy = false;
    }
  }

  function tick() {
    if (ended) return;
    if (!drawWebglFrame()) {
      void drawSvgFallbackFrame();
    }
    timer = window.setTimeout(tick, 66);
  }

  // Draw initial frame synchronously BEFORE starting MediaRecorder so frame 0 is never blank.
  drawWebglFrame();
  recorder.start(500);
  timer = window.setTimeout(tick, 66);

  return {
    async stop(): Promise<StudioVideoRecordingResult> {
      if (!ended) {
        // Draw one crisp final frame and update poster to final state before stopping
        drawWebglFrame();
        capturePosterSnapshot();
      }
      ended = true;
      window.clearTimeout(timer);
      const durationMs = Math.max(500, performance.now() - started);
      if (recorder.state !== "inactive") {
        try {
          recorder.requestData();
        } catch {
          // Ignore if browser does not support explicit requestData before stop
        }
        recorder.stop();
      }
      try {
        const blob = await complete;
        return {
          blob,
          durationMs,
          mimeType: blob.type || mimeType || "video/webm",
          ...(posterImageData ? { posterImageData } : {}),
        };
      } finally {
        stream.getTracks().forEach((track) => track.stop());
      }
    },
  };
}
