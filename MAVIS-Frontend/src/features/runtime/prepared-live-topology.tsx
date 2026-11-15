"use client";

import { useMemo, useState } from "react";
import type { Response } from "@/lib/api/contracts";
import { StudioObservability, type StudioQuickAction } from "./studio-observability";

type Studio = Response<"studioState">;

export function PreparedLiveTopology({ data, selected, onSelect, busy, onCommand }: {
  data: Studio;
  selected: string;
  onSelect: (service: string) => void;
  busy: boolean;
  onCommand: (action: StudioQuickAction["action"], service: string, replicas?: number) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [showControllers, setShowControllers] = useState(false);
  const topology = data.topology!;
  function replicas(service: string) {
    const confirmed = [...data.actions].reverse().find((action) =>
      action.service === service && action.status === "CONFIRMED",
    )?.result?.replicasAfter;
    return confirmed ?? data.telemetry?.services.find((item) => item.service === service)?.runningReplicas;
  }
  const names = Object.fromEntries(topology.blocks.map((block) => [block.service, block.label]));
  const visible = useMemo(() => {
    const blocks = new Set(topology.blocks.map((block) => block.service));
    return { ...data, services: data.services.filter((service) => blocks.has(service)) };
  }, [data, topology]);
  const configuredEdges = topology.connections.filter((link) => (replicas(link.controllerService) ?? 0) > 0)
    .map((link) => ({ ...link, id: link.controllerService, active: true }));
  async function command(action: StudioQuickAction["action"], service: string, count?: number) {
    if (busy) return;
    setMessage("");
    try { await onCommand(action, service, count); }
    catch { setMessage("The command was not confirmed. Check the session action history before retrying."); }
  }
  function connect(from: string, to: string) {
    const link = topology.connections.find((item) => item.from === from && item.to === to);
    if (!link) {
      setMessage("This connection is not prepared in the assigned repository.");
      return;
    }
    const running = replicas(link.controllerService);
    if (running === undefined) { setMessage("Wait for observed container state before changing this connection."); return; }
    if (running === 0) void command("START", link.controllerService);
  }
  function disconnect(from: string, to: string) {
    const link = topology.connections.find((item) => item.from === from && item.to === to);
    if (link && (replicas(link.controllerService) ?? 0) > 0) void command("STOP", link.controllerService);
  }
  return (
    <section aria-label="Prepared Live builder" className="space-y-3 rounded-xl border border-slate-700 p-3">
      <div>
        <h3 className="font-semibold">Prepared project · Live</h3>
        <p className="text-xs text-muted-foreground">Blocks activate pinned services. Connections control the repository's prepared routes. Commands wait for Runner confirmation.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {topology.blocks.map((block) => {
          const running = replicas(block.service);
          return <button type="button" key={block.service} disabled={busy || running === undefined || running > 0}
            onClick={() => void command("START", block.service)}
            className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-50">
            {running === undefined ? "Waiting" : running > 0 ? "Running" : "+ Add"} · {block.label}
          </button>;
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showControllers} onChange={(event) => setShowControllers(event.target.checked)} />
        Show routing services and their observed trace hops
      </label>
      {message && <p role="status" className="text-sm text-amber-300">{message}</p>}
      <div className="relative h-[min(65vh,640px)] min-h-72 overflow-hidden rounded-lg border border-slate-800">
        <StudioObservability data={showControllers ? data : visible} selected={selected} onSelect={onSelect}
          canvasOnly defaultView="3D" nodeNames={names} configuredEdges={configuredEdges}
          busy={busy}
          onQuickAction={(action) => {
            const block = topology.blocks.find((item) => item.service === action.service);
            if (action.action === "SCALE" && (!block?.canScale || !action.replicas || action.replicas > 8)) {
              setMessage("This block only supports the permitted replica range, up to 8.");
              return;
            }
            void command(action.action, action.service, action.replicas);
          }}
          onConnect={connect} onDisconnect={disconnect}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {topology.blocks.map((block) => {
          const running = replicas(block.service);
          return <div key={block.service} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
            <button type="button" onClick={() => onSelect(block.service)} className="mr-auto font-semibold">{block.label}</button>
            <span>{running === undefined ? "Waiting for telemetry" : `${running} pods`}</span>
            <button type="button" disabled={busy || !running}
              onClick={() => void command("STOP", block.service)} className="text-red-300 disabled:opacity-40">Remove block</button>
            {block.canScale && <button type="button" disabled={busy || !running || running >= 8}
              onClick={() => void command("SCALE", block.service, (running ?? 0) + 1)}
              className="text-sky-300 disabled:opacity-40">Clone replica</button>}
            {block.canScale && <input type="number" min={1} max={8} step={1}
              aria-label={`Live replicas for ${block.label}`} defaultValue={Math.max(1, running ?? 1)}
              key={`${block.service}:${running}`} disabled={busy || !running} className="w-14 rounded border bg-background px-1"
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isInteger(value) && value >= 1 && value <= 8 && value !== running)
                  void command("SCALE", block.service, value);
              }} />}
          </div>;
        })}
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-semibold">Prepared connections</summary>
        <ul className="mt-2 space-y-2">
          {topology.connections.map((link) => {
            const running = replicas(link.controllerService);
            return <li key={link.controllerService} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="mr-auto">{names[link.from]} → {names[link.to]} · {link.protocol}</span>
              <span>{running === undefined ? "Waiting" : running > 0 ? "Enabled" : "Disconnected"}</span>
              <button type="button" disabled={busy || running === undefined} className="text-sky-300 disabled:opacity-40"
                onClick={() => running ? disconnect(link.from, link.to) : connect(link.from, link.to)}>
                {running ? "Disconnect" : "Connect"}
              </button>
            </li>;
          })}
        </ul>
      </details>
    </section>
  );
}
