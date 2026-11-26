"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Maximize2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";

export type EvidenceFrame = {
  elapsedMs: number;
  label: string;
  svg: string;
  totals: { pods: number; demandRps: number; handledRps: number; droppedRps: number };
  nodes: Array<{
    id: string; name: string; type: string; replicas: number;
    demandRps: number; capacityRps: number; droppedRps: number; p95Ms: number | null;
    configuration: object;
  }>;
  connections: Array<{ from: string; to: string; protocol: string }>;
};

export function evidenceImage(svg: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function openEvidenceDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mavis-studio-evidence", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStudioEvidence<T>() {
  const database = await openEvidenceDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = database.transaction("snapshots").objectStore("snapshots").getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function storeStudioEvidence(snapshot: { id: string }) {
  const database = await openEvidenceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore("snapshots").put(snapshot);
    });
  } finally {
    database.close();
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function downloadStudioEvidence(snapshot: {
  id: string; capturedAt: string; explanation: string; frame: EvidenceFrame; replay: EvidenceFrame[];
}) {
  const frames = snapshot.replay.length ? snapshot.replay : [snapshot.frame];
  const sections = frames.map((frame, index) => {
    const names = new Map(frame.nodes.map((node) => [node.id, node.name]));
    const metrics = `${frame.totals.pods} pods · ${frame.totals.demandRps} req/s incoming · ${frame.totals.handledRps} req/s handled · ${frame.totals.droppedRps} req/s dropped`;
    return `<details ${index === frames.length - 1 ? "open" : ""}><summary>${index + 1}. ${escapeHtml(frame.label)} · ${(frame.elapsedMs / 1000).toFixed(1)}s</summary>
      <p>${escapeHtml(metrics)}</p><img alt="Complete architecture diagram" src="${evidenceImage(frame.svg)}">
      <h3>Nodes and configuration</h3><ul>${frame.nodes.map((node) => `<li><strong>${escapeHtml(node.name)}</strong> · ${escapeHtml(node.type)} · ${node.replicas} pods · capacity ${node.capacityRps} req/s · p95 ${node.p95Ms ?? "—"} ms<pre>${escapeHtml(JSON.stringify(node.configuration, null, 2))}</pre></li>`).join("")}</ul>
      <h3>Connections</h3><ul>${frame.connections.map(({ from, to, protocol }) => `<li>${escapeHtml(names.get(from) ?? from)} → ${escapeHtml(names.get(to) ?? to)} · ${escapeHtml(protocol)}</li>`).join("")}</ul></details>`;
  }).join("");
  const report = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MAVIS Studio evidence</title>
    <style>body{font:16px system-ui;background:#0b1220;color:#e2e8f0;max-width:1100px;margin:auto;padding:24px}details,pre{background:#111c30;padding:12px;margin:10px 0;border-radius:8px}summary{cursor:pointer}img{display:block;max-width:100%;height:auto}pre{white-space:pre-wrap}button{padding:6px 12px}</style>
    <h1>MAVIS Studio evidence</h1><p>Sandbox simulation · ${escapeHtml(snapshot.capturedAt)}</p>
    <p>${escapeHtml(snapshot.explanation)}</p>
    <button id="play" type="button" ${frames.length < 2 ? "disabled" : ""}>Play replay</button>
    <main>${sections}</main><script>
    const steps = [...document.querySelectorAll("main > details")];
    let timer, index = 0;
    document.getElementById("play").onclick = () => {
      clearInterval(timer); index = 0;
      const show = () => steps.forEach((step, i) => { step.open = i === index; });
      show();
      timer = setInterval(() => { if (++index >= steps.length) clearInterval(timer); else show(); }, 1200);
    };
    </script></html>`;
  const url = URL.createObjectURL(new Blob([report], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `mavis-evidence-${snapshot.id}.html`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StudioEvidenceReplay({ frames, onSound }: {
  frames: EvidenceFrame[];
  onSound?: (sound: "play" | "pause" | "checkpoint") => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = frames[index];

  useEffect(() => {
    if (!playing || index >= frames.length - 1) return;
    const timer = window.setTimeout(() => setIndex(index + 1), 1200);
    return () => window.clearTimeout(timer);
  }, [playing, index, frames.length]);

  if (!frame) return null;
  const isPlaying = playing && index < frames.length - 1;
  return (
    <div className="space-y-2">
      <img className="max-h-72 w-full rounded-md border border-slate-700 object-contain" src={evidenceImage(frame.svg)} alt="Replay diagram" />
      <div className="flex items-center gap-2">
        <button type="button" className="rounded border border-slate-600 px-2 py-1"
          onClick={() => {
            if (!isPlaying && index === frames.length - 1) setIndex(0);
            setPlaying(!isPlaying);
            onSound?.(isPlaying ? "pause" : "play");
          }}>
          {isPlaying ? "Pause" : "Play replay"}
        </button>
        <input type="range" aria-label="Replay step" min={0} max={frames.length - 1} value={index}
          onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }}
          onPointerUp={() => onSound?.("checkpoint")}
          onKeyUp={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) onSound?.("checkpoint");
          }}
          className="min-w-0 flex-1" />
      </div>
      <p className="text-slate-200">Step {index + 1}/{frames.length} · {(frame.elapsedMs / 1000).toFixed(1)}s · {frame.label}</p>
      <p className="text-slate-400">{frame.totals.pods} pods · {frame.totals.handledRps} req/s handled · {frame.totals.droppedRps} req/s dropped</p>
      {frame.connections.length > 0 && (
        <ul aria-label="Step traffic flows" className="flex flex-wrap gap-1 pt-0.5 font-mono text-[10px]">
          {frame.connections.slice(0, 8).map((conn, idx) => (
            <li
              key={`${conn.from}-${conn.to}-${idx}`}
              className="rounded border border-slate-800 bg-slate-900/80 px-1.5 py-0.5 text-slate-300"
            >
              <span className="text-sky-300">{conn.from}</span>
              <span className="mx-1 text-slate-500">→</span>
              <span className="text-emerald-300">{conn.to}</span>
              {conn.protocol && <span className="ml-1 text-slate-400">· {conn.protocol}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function deleteStudioEvidence(id: string) {
  const database = await openEvidenceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore("snapshots").delete(id);
    });
  } finally {
    database.close();
  }
}

export function StudioVideo({
  blob,
  durationMs,
  posterSvg,
  posterDataUrl,
}: {
  blob: Blob;
  durationMs: number;
  posterSvg?: string | undefined;
  posterDataUrl?: string | undefined;
}) {
  const { t } = useLocale();
  const [url, setUrl] = useState("");
  const poster = useMemo(
    () =>
      posterDataUrl ||
      (posterSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(posterSvg)}` : undefined),
    [posterDataUrl, posterSvg],
  );
  useEffect(() => {
    const source = URL.createObjectURL(blob);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [blob]);
  return (
    <div className="my-2 space-y-2">
      <video
        aria-label={t("Recorded Studio video", "Video thực hành Studio")}
        controls
        playsInline
        preload="auto"
        poster={poster}
        src={url || undefined}
        className="max-h-72 w-full rounded-lg border border-slate-800 bg-[#070b14] object-contain"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {(durationMs / 1000).toFixed(1)}s {t("recorded", "đã quay")}
        </span>
        {url && (
          <a
            className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-300"
            href={url}
            download={blob.type.includes("mp4") ? "mavis-recording.mp4" : "mavis-recording.webm"}
          >
            <Download aria-hidden="true" className="size-3" />
            {t("Download video", "Tải video")}
          </a>
        )}
      </div>
    </div>
  );
}

function safeSnapshotImageSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.startsWith("data:image/webp;base64,") || raw.startsWith("data:image/png;base64,")) {
    return raw;
  }
  return null;
}

function safeSnapshotVideoSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lower = raw.slice(0, 48).toLowerCase();
  if (
    (lower.startsWith("data:video/webm") || lower.startsWith("data:video/mp4")) &&
    lower.includes(";base64,")
  ) {
    return raw;
  }
  return null;
}

export function StudioSnapshotPreviewCard({
  sessionId,
  snapshot,
  index,
  isLight = false,
  exerciseBadge,
  accentColor,
  missionGoal,
  exerciseStats,
  onDownloadEvidence,
}: {
  sessionId: string;
  snapshot: {
    id: string;
    capturedAt: string;
    explanation: string;
    digest?: string | undefined;
    hasVideo?: boolean | undefined;
    imageData?: string | undefined;
    videoData?: string | undefined;
  };
  index: number;
  isLight?: boolean;
  exerciseBadge?: string | undefined;
  accentColor?: string | undefined;
  missionGoal?: string | undefined;
  exerciseStats?: ReadonlyArray<{ label: string; value: string }> | undefined;
  onDownloadEvidence?: ((snapshotId: string) => void) | undefined;
}) {
  const { t } = useLocale();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const inlineImage = safeSnapshotImageSrc(snapshot.imageData);
  const inlineVideo = safeSnapshotVideoSrc(snapshot.videoData);
  const needsFetch = Boolean(sessionId && snapshot.id && !inlineImage && !inlineVideo);
  const detail = useApiQuery(
    "studioSnapshot",
    { sessionId, snapshotId: snapshot.id },
    { enabled: needsFetch },
  );
  const imageSrc = inlineImage ?? safeSnapshotImageSrc(detail.data?.["imageData"]);
  const videoSrc = inlineVideo ?? safeSnapshotVideoSrc(detail.data?.["videoData"]);
  const isVideo = Boolean(videoSrc || snapshot.hasVideo);
  const fileExt = imageSrc?.startsWith("data:image/webp;") ? "webp" : "png";
  const videoExt = videoSrc?.toLowerCase().startsWith("data:video/mp4") ? "mp4" : "webm";

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  return (
    <>
      <div
        className={`flex flex-col gap-2.5 overflow-hidden rounded-xl border p-3 text-xs ${
          isLight
            ? "border-slate-200 bg-white text-slate-900 shadow-2xs"
            : "border-slate-800 bg-slate-900/80 text-slate-100"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  isVideo
                    ? isLight
                      ? "bg-sky-100 text-sky-800"
                      : "bg-sky-500/20 text-sky-200"
                    : isLight
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {isVideo && <Video aria-hidden="true" className="size-3" />}
                {isVideo
                  ? `${t("VIDEO", "VIDEO")} #${index + 1}`
                  : `${t("SNAPSHOT", "ẢNH CHỤP")} #${index + 1}`}
              </span>
              {exerciseBadge && (
                <span
                  className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-950"
                  style={{ backgroundColor: accentColor ?? "#38bdf8" }}
                >
                  {exerciseBadge}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {new Date(snapshot.capturedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
          {imageSrc && !videoSrc && (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={t("Zoom snapshot image", "Phóng to ảnh Snapshot")}
              title={t("Zoom snapshot image", "Phóng to ảnh Snapshot")}
              className={`shrink-0 rounded-md border p-1.5 transition ${
                isLight
                  ? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <Maximize2 aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>

        {/* Visual Media: Real 3D Video Player OR Crisp Snapshot Preview */}
        {videoSrc ? (
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#070b14]">
            <video
              controls
              playsInline
              preload="metadata"
              poster={imageSrc ?? undefined}
              src={videoSrc}
              className="max-h-60 w-full object-contain"
            />
          </div>
        ) : imageSrc ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className={`group relative block w-full overflow-hidden rounded-lg border text-left transition ${
              isLight
                ? "border-slate-200 bg-slate-50 hover:border-sky-400"
                : "border-slate-800 bg-[#070b14] hover:border-sky-500/60"
            }`}
          >
            <img
              src={imageSrc}
              alt={`Studio Snapshot #${index + 1}: ${snapshot.explanation}`}
              className="max-h-60 w-full object-contain"
            />
            <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
              <Maximize2 aria-hidden="true" className="size-3" />
              {t("Click to enlarge", "Nhấn để phóng to")}
            </span>
          </button>
        ) : detail.isLoading ? (
          <div
            className={`flex h-36 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground ${
              isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-950/40"
            }`}
          >
            {isVideo
              ? t("Loading recorded video…", "Đang tải video thực hành…")
              : t("Loading snapshot image…", "Đang tải ảnh Snapshot…")}
          </div>
        ) : (
          <div
            className={`flex h-20 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground ${
              isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-950/30"
            }`}
          >
            {t("No image preview saved for this snapshot.", "Snapshot này không có ảnh xem trước.")}
          </div>
        )}

        {/* Exercise Description & Key Runtime Context */}
        {(missionGoal?.trim() || (exerciseStats && exerciseStats.length > 0)) && (
          <div
            className={`space-y-1.5 rounded-lg border p-2.5 text-[11px] ${
              isLight
                ? "border-slate-200/90 bg-slate-50/80 text-slate-700"
                : "border-slate-800 bg-slate-950/50 text-slate-300"
            }`}
          >
            {missionGoal?.trim() && (
              <div>
                <span className="font-semibold text-muted-foreground">
                  {t("Exercise description:", "Mô tả bài tập:")}{" "}
                </span>
                <span className="line-clamp-2 whitespace-pre-wrap">{missionGoal.trim()}</span>
              </div>
            )}
            {exerciseStats && exerciseStats.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {exerciseStats.slice(0, 4).map((item) => (
                  <span
                    key={item.label}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                      isLight
                        ? "border-slate-200 bg-white text-slate-800"
                        : "border-slate-700 bg-slate-900 text-slate-200"
                    }`}
                  >
                    <span className="text-muted-foreground">{item.label}: </span>
                    <span className="font-semibold">{item.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Student Observation Description */}
        {snapshot.explanation?.trim() && (
          <div className="space-y-0.5">
            <p className="text-[10.5px] font-semibold text-muted-foreground">
              {t("Observation note", "Ghi chú quan sát của sinh viên")}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed font-medium">
              {snapshot.explanation.trim()}
            </p>
          </div>
        )}

        {/* Clean Action Footer (no raw sha256 clutter) */}
        <div
          className={`flex flex-wrap items-center justify-end gap-1.5 border-t pt-2 ${
            isLight ? "border-slate-200" : "border-slate-800"
          }`}
        >
          {videoSrc && (
            <a
              href={videoSrc}
              download={`mavis-video-${index + 1}-${snapshot.id.slice(0, 8)}.${videoExt}`}
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium transition ${
                isLight
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              <Download aria-hidden="true" className="size-3" />
              {t("Download Video", "Tải video")}
            </a>
          )}
          {imageSrc && (
            <a
              href={imageSrc}
              download={`mavis-snapshot-${index + 1}-${snapshot.id.slice(0, 8)}.${fileExt}`}
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium transition ${
                isLight
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              <Download aria-hidden="true" className="size-3" />
              {t("Download Image", "Tải ảnh")}
            </a>
          )}
          {onDownloadEvidence && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2.5 text-[11px]"
              onClick={() => onDownloadEvidence(snapshot.id)}
            >
              {t("JSON", "Minh chứng JSON")}
            </Button>
          )}
        </div>
      </div>

      {lightboxOpen &&
        imageSrc &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Studio Snapshot #${index + 1}`}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-xs"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                      {t("SNAPSHOT", "ẢNH CHỤP")} #{index + 1}
                    </span>
                    {exerciseBadge && (
                      <span
                        className="rounded px-2 py-0.5 font-mono text-[10px] font-bold text-slate-950"
                        style={{ backgroundColor: accentColor ?? "#38bdf8" }}
                      >
                        {exerciseBadge}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(snapshot.capturedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-200">{snapshot.explanation}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={imageSrc}
                    download={`mavis-snapshot-${index + 1}-${snapshot.id.slice(0, 8)}.${fileExt}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-100 hover:bg-slate-700"
                  >
                    <Download aria-hidden="true" className="size-3.5" />
                    {t("Download Image", "Tải ảnh")}
                  </a>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(false)}
                    aria-label={t("Close preview", "Đóng xem trước")}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#070b14] p-3">
                <img
                  src={imageSrc}
                  alt={`Studio Snapshot #${index + 1}`}
                  className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}