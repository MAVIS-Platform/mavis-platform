"use client";
import { useState } from "react";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Server, ArrowRight, Code2 } from "lucide-react";
import {
  communicationTitle,
  communicationDescription,
  feignContract,
  nodeCommunications,
} from "./communication-evidence";

export function CommunicationPanel({
  projectId,
  model,
  selectedId,
  onSelect,
}: {
  projectId?: string;
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [limit, setLimit] = useState(4);
  if (!selectedId) return null;

  const edge = model.edges.find((e) => e.id === selectedId);
  const contract = edge ? feignContract(edge) : null;
  const description = edge ? communicationDescription(edge) : null;
  const channel = edge
    ? model.elements.find(
        (node) =>
          (node.id === edge.from || node.id === edge.to) && node.elementType === "MESSAGE_CHANNEL",
      )
    : undefined;
  const related = model.elements.some((e) => e.id === selectedId)
    ? nodeCommunications(model, selectedId)
    : [];
  const name = (id: string) =>
    model.elements.find((e) => e.id === id)?.name ?? "Unresolved endpoint";

  if (!contract && !related.length && !description) return null;

  const edgeProps = (edge?.properties as Record<string, unknown>) ?? {};

  return (
    <section
      aria-label="Communication evidence"
      className="space-y-4 rounded-xl border bg-background p-4 text-sm leading-6"
    >
      <h3 className="font-semibold text-foreground flex items-center gap-1.5">
        <Code2 className="h-4 w-4 text-primary" />
        How these services communicate
      </h3>

      {!contract && edge && description && (
        <>
          <p className="font-medium">{communicationTitle(edge)}</p>
          <p className="text-muted-foreground">{description}</p>
        </>
      )}

      {channel && (
        <p className="break-all text-xs">
          Channel: {String(channel.properties?.["channelName"] ?? channel.name)} · Protocol:{" "}
          {String(channel.properties?.["protocol"] ?? "Not established")} · Broker binding:{" "}
          {String(channel.properties?.["transportAuthority"] ?? "Not established")}
        </p>
      )}

      {contract && (
        <>
          <p className="font-medium text-primary break-all">{contract.title}</p>
          <dl className="space-y-1 break-words text-xs">
            <div>
              <dt className="font-medium text-muted-foreground">Service relationship</dt>
              <dd className="font-semibold text-foreground">
                {contract.sourceService} → {contract.targetService}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Client interface / method</dt>
              <dd className="font-mono">
                {contract.clientInterface} · {contract.clientMethod}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Target selection</dt>
              <dd>{contract.targetSelector}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Receiver evidence</dt>
              <dd>
                {contract.serverMatch === "MATCHED_METHOD_PATH"
                  ? "Matching method + path found in the target service source"
                  : contract.serverMatch === "AMBIGUOUS_ENDPOINT"
                    ? "Multiple matching receiver endpoints; no unique receiver established"
                    : "Matching receiver endpoint not established in imported source"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Caller evidence</dt>
              <dd>
                {contract.callSiteCount
                  ? `${contract.callSiteCount} typed call site(s) in source`
                  : `No unique call site attached · ${contract.invocationResolution}`}
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs">
            {contract.limitation} Expand the saved evidence below to inspect caller and receiver
            file/line snippets.
          </p>
        </>
      )}

      {/* 2-SIDED CODE EVIDENCE FOR SINGLE EDGE */}
      {edge && Boolean(edgeProps["callerFile"] || edgeProps["calleeFile"]) && (
        <div className="space-y-2.5 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
          <p className="font-bold text-sky-400 text-xs flex items-center gap-1.5 uppercase tracking-wide">
            <Code2 className="h-3.5 w-3.5" />
            Bằng chứng Code 2 Phía (Bilateral Code Evidence)
          </p>

          <div className="grid gap-2">
            {Boolean(edgeProps["callerFile"]) && (
              <div className="rounded border border-sky-500/20 bg-background/90 p-2.5 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-sky-400 flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    Đầu gọi (Caller): {String(edgeProps["callerService"] || name(edge.from))}
                  </span>
                  <span className="font-mono text-[11px] text-sky-300 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/50">
                    {String(edgeProps["callerFile"])}{edgeProps["callerLine"] ? `:${edgeProps["callerLine"]}` : ""}
                  </span>
                </div>
                {Boolean(edgeProps["callerSnippet"]) && (
                  <pre className="overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-100 border border-slate-800">
                    {String(edgeProps["callerSnippet"])}
                  </pre>
                )}
              </div>
            )}

            {Boolean(edgeProps["calleeFile"]) && (
              <div className="rounded border border-emerald-500/20 bg-background/90 p-2.5 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    Đầu nhận (Receiver): {String(edgeProps["calleeService"] || name(edge.to))}
                  </span>
                  <span className="font-mono text-[11px] text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
                    {String(edgeProps["calleeFile"])}{edgeProps["calleeLine"] ? `:${edgeProps["calleeLine"]}` : ""}
                  </span>
                </div>
                {Boolean(edgeProps["calleeSnippet"]) && (
                  <pre className="overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-100 border border-slate-800">
                    {String(edgeProps["calleeSnippet"])}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RELATED COMMUNICATIONS LIST FOR NODE */}
      {related.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Related communication relationships ({related.length}), including this service&apos;s
            components:
          </p>
          <ul className="space-y-3">
            {related.slice(0, limit).map((item) => {
              const p = (item.properties as Record<string, unknown>) ?? {};
              const httpMethod = typeof p["httpMethod"] === "string" ? p["httpMethod"] : "";
              const httpPath = typeof p["httpPath"] === "string" ? p["httpPath"] : "";

              return (
                <li key={item.id} className="rounded-xl border bg-card p-3 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-semibold text-foreground">{name(item.from)}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{name(item.to)}</span>
                    </div>
                    {httpMethod && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {httpMethod} {httpPath}
                      </Badge>
                    )}
                  </div>

                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    {communicationTitle(item)}
                  </p>

                  {/* 2-Sided Code Snippets if present */}
                  {Boolean(p["callerFile"] || p["calleeFile"]) && (
                    <div className="grid gap-2 pt-1">
                      {Boolean(p["callerFile"]) && (
                        <div className="rounded border border-sky-500/20 bg-muted/30 p-2 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                            <span className="font-medium text-sky-400 flex items-center gap-1">
                              <Send className="h-3 w-3" />
                              Caller: {String(p["callerService"] || name(item.from))}
                            </span>
                            <span className="font-mono text-[10px] text-sky-300">
                              {String(p["callerFile"])}{p["callerLine"] ? `:${p["callerLine"]}` : ""}
                            </span>
                          </div>
                          {Boolean(p["callerSnippet"]) && (
                            <pre className="overflow-x-auto rounded bg-slate-950 p-1.5 font-mono text-[10px] text-slate-100 border border-slate-800">
                              {String(p["callerSnippet"])}
                            </pre>
                          )}
                        </div>
                      )}

                      {Boolean(p["calleeFile"]) && (
                        <div className="rounded border border-emerald-500/20 bg-muted/30 p-2 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                            <span className="font-medium text-emerald-400 flex items-center gap-1">
                              <Server className="h-3 w-3" />
                              Receiver: {String(p["calleeService"] || name(item.to))}
                            </span>
                            <span className="font-mono text-[10px] text-emerald-300">
                              {String(p["calleeFile"])}{p["calleeLine"] ? `:${p["calleeLine"]}` : ""}
                            </span>
                          </div>
                          {Boolean(p["calleeSnippet"]) && (
                            <pre className="overflow-x-auto rounded bg-slate-950 p-1.5 font-mono text-[10px] text-slate-100 border border-slate-800">
                              {String(p["calleeSnippet"])}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelect(item.id)}>
                      Inspect relationship evidence
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {related.length > limit && (
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setLimit(limit + 4)}>
              Show more relationships
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
