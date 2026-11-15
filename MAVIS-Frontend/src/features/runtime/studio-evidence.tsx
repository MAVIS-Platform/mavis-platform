"use client";

import { useEffect, useState } from "react";

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

export function StudioEvidenceReplay({ frames }: { frames: EvidenceFrame[] }) {
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
          }}>
          {isPlaying ? "Pause" : "Play replay"}
        </button>
        <input type="range" aria-label="Replay step" min={0} max={frames.length - 1} value={index}
          onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }}
          className="min-w-0 flex-1" />
      </div>
      <p className="text-slate-200">Step {index + 1}/{frames.length} · {(frame.elapsedMs / 1000).toFixed(1)}s · {frame.label}</p>
      <p className="text-slate-400">{frame.totals.pods} pods · {frame.totals.handledRps} req/s handled · {frame.totals.droppedRps} req/s dropped</p>
    </div>
  );
}
