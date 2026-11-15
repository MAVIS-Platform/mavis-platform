"use client";

import { serializeStudioGraph } from "./studio-observability";

export function startStudioRecording(svg: SVGSVGElement) {
  if (typeof MediaRecorder === "undefined") throw new Error("Video recording is unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 792;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas recording is unavailable");
  const stream = canvas.captureStream(20);
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  let timer = 0;
  let ended = false;
  const started = performance.now();
  const complete = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    recorder.onerror = () => reject(new Error("Video recording failed"));
  });
  async function draw() {
    if (ended) return;
    const clone = new DOMParser().parseFromString(serializeStudioGraph(svg), "image/svg+xml");
    // Freeze each SMIL traffic pulse at its actual position for this video frame.
    clone.querySelectorAll("animateMotion").forEach((motion) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", motion.getAttribute("path") ?? "");
      const seconds = Number.parseFloat(motion.getAttribute("dur") ?? "2");
      const position = path.getPointAtLength(path.getTotalLength() * ((svg.getCurrentTime() % seconds) / seconds));
      motion.parentElement?.setAttribute("transform", `translate(${position.x} ${position.y})`);
      motion.remove();
    });
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
      if (!ended) {
        context!.fillStyle = "#070b14";
        context!.fillRect(0, 0, canvas.width, canvas.height);
        context!.drawImage(image, 0, 0, canvas.width, canvas.height);
      }
    } catch {
      // Keep the previous frame during a transient redraw.
    } finally {
      URL.revokeObjectURL(url);
      if (!ended) timer = window.setTimeout(() => void draw(), 50);
    }
  }
  recorder.start(1000);
  void draw();
  return {
    async stop() {
      ended = true;
      clearTimeout(timer);
      const durationMs = performance.now() - started;
      if (recorder.state !== "inactive") recorder.stop();
      try { return { blob: await complete, durationMs }; }
      finally { stream.getTracks().forEach((track) => track.stop()); }
    },
  };
}
