"use client";
import { useState } from "react";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import {
  communicationTitle,
  communicationDescription,
  feignContract,
  nodeCommunications,
} from "./communication-evidence";

export function CommunicationPanel({
  model,
  selectedId,
  onSelect,
}: {
  model: ArchitecturalModel;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [limit, setLimit] = useState(12);
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
  return (
    <section
      aria-label="Communication evidence"
      className="space-y-2 rounded-lg border bg-background p-3 text-xs"
    >
      <h3 className="font-semibold">How these services communicate</h3>
      {!contract && edge && description && (
        <>
          <p className="font-medium">{communicationTitle(edge)}</p>
          <p>{description}</p>
        </>
      )}
      {channel && (
        <p className="break-all">
          Channel: {String(channel.properties?.["channelName"] ?? channel.name)} · Protocol:{" "}
          {String(channel.properties?.["protocol"] ?? "Not established")} · Broker binding:{" "}
          {String(channel.properties?.["transportAuthority"] ?? "Not established")}
        </p>
      )}
      {contract && (
        <>
          <p className="font-medium text-primary break-all">{contract.title}</p>
          <dl className="space-y-1 break-words">
            <div>
              <dt className="font-medium">Service relationship</dt>
              <dd>
                {contract.sourceService} → {contract.targetService}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Client interface / method</dt>
              <dd>
                {contract.clientInterface} · {contract.clientMethod}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Target selection</dt>
              <dd>{contract.targetSelector}</dd>
            </div>
            <div>
              <dt className="font-medium">Receiver evidence</dt>
              <dd>
                {contract.serverMatch === "MATCHED_METHOD_PATH"
                  ? "Matching method + path found in the target service source"
                  : contract.serverMatch === "AMBIGUOUS_ENDPOINT"
                    ? "Multiple matching receiver endpoints; no unique receiver established"
                    : "Matching receiver endpoint not established in imported source"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Caller evidence</dt>
              <dd>
                {contract.callSiteCount
                  ? `${contract.callSiteCount} typed call site(s) in source`
                  : `No unique call site attached · ${contract.invocationResolution}`}
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground">
            {contract.limitation} Expand the saved evidence below to inspect caller and receiver
            file/line snippets.
          </p>
        </>
      )}
      {related.length > 0 && (
        <>
          <p>
            Related communication relationships ({related.length}), including this service&apos;s
            components:
          </p>
          <ul className="space-y-2">
            {related.slice(0, limit).map((item) => (
              <li key={item.id} className="rounded border p-2">
                <p className="break-words">
                  {name(item.from)} → {name(item.to)}
                </p>
                <p className="break-all text-muted-foreground">{communicationTitle(item)}</p>
                <Button size="sm" variant="outline" onClick={() => onSelect(item.id)}>
                  Inspect relationship evidence
                </Button>
              </li>
            ))}
          </ul>
          {related.length > limit && (
            <Button size="sm" variant="outline" onClick={() => setLimit(limit + 12)}>
              Show more relationships
            </Button>
          )}
        </>
      )}
    </section>
  );
}
