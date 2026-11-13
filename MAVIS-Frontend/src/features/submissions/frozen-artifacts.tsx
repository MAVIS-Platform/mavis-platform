"use client";
import { useEffect, useRef, useState } from "react";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { DetailPanel } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import type { Submission } from "@/types/domain";
export function downloadArtifact(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function projectionDsl(payload: Record<string, unknown>): string | null {
  if (!Array.isArray(payload["nodes"]) || !Array.isArray(payload["edges"])) return null;
  const nodes = payload["nodes"] as Array<Record<string, unknown>>,
    edges = payload["edges"] as Array<Record<string, unknown>>;
  const ids = new Map(nodes.map((n, i) => [String(n["id"]), `n${i}`]));
  const label = (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\n", " ");
  return [
    "flowchart LR",
    ...nodes.map((n, i) => `n${i}["${label(n["name"] ?? n["label"] ?? n["id"])}"]`),
    ...edges.flatMap((e) => {
      const from = ids.get(String(e["from"] ?? e["source"])),
        to = ids.get(String(e["to"] ?? e["target"]));
      return from && to ? [`${from} -->|"${label(e["label"] ?? e["type"] ?? "")}"| ${to}`] : [];
    }),
  ].join("\n");
}
function ReadOnlyDrawio({ xml, title }: { xml: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null),
    [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    setStatus("loading");
    let timer = window.setTimeout(() => setStatus("error"), 12000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") return;
      if (event.data?.type === "mavis-submission-ready")
        frame.current?.contentWindow?.postMessage({ type: "mavis-submission-load", xml }, "*");
      if (event.data?.type === "mavis-submission-rendered") {
        window.clearTimeout(timer);
        setStatus("ready");
      }
      if (event.data?.type === "mavis-submission-error") {
        window.clearTimeout(timer);
        setStatus("error");
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [xml]);
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs text-muted-foreground">
        Frozen submitted diagram · read-only
        {status === "loading" ? " · Loading local preview…" : ""}
      </p>
      {status === "error" && (
        <p role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">
          Preview unavailable. Download the original submitted diagram below.
        </p>
      )}
      <iframe
        ref={frame}
        key={xml}
        sandbox="allow-scripts"
        title={title}
        src="/submission-viewer.html"
        className={`w-full rounded-lg border bg-white ${status === "error" ? "hidden" : "h-[440px] sm:h-[560px]"}`}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => downloadArtifact(title + ".drawio", xml, "application/xml")}
      >
        Download submitted draw.io
      </Button>
    </div>
  );
}
export function FrozenArtifacts({ submission }: { submission: Submission }) {
  const layout = submission.diagramLayout;
  if (!layout)
    return (
      <DetailPanel title="Submitted diagram">
        {submission.evidencePackageDigest && (
          <p className="break-all font-mono text-xs text-muted-foreground">
            Evidence package: {submission.evidencePackageDigest}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          No diagram payload was returned for this submission. The pinned ID is{" "}
          {submission.diagramVersionId ?? "unavailable"}.
        </p>
      </DetailPanel>
    );
  const artifacts = Array.isArray(layout["artifacts"])
    ? (layout["artifacts"] as Array<{
        notation: string;
        level?: string;
        layoutJson: Record<string, unknown>;
      }>)
    : [{ notation: submission.diagramNotation ?? "Diagram", layoutJson: layout }];
  return (
    <DetailPanel title="Frozen submitted diagrams">
      {submission.evidencePackageDigest && (
        <p className="break-all font-mono text-xs text-muted-foreground">
          Evidence package SHA-256: {submission.evidencePackageDigest}
        </p>
      )}
      <p className="break-all text-xs text-muted-foreground">
        Pinned bundle/version: {submission.diagramVersionId}. Later edits do not change the contents
        below.
      </p>
      {artifacts.map((artifact, index) => {
        const payload = artifact.layoutJson ?? {},
          xml = payload["drawioXml"],
          dsl = payload["mermaidDsl"] ?? payload["mermaid"] ?? projectionDsl(payload);
        return (
          <section key={index} className="space-y-3 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">
              {artifact.notation} · {String(payload["viewId"] ?? artifact.level ?? "")}{" "}
              {payload["documentRevision"] ? `· revision ${payload["documentRevision"]}` : ""}
            </h3>
            {typeof xml === "string" ? (
              <ReadOnlyDrawio xml={xml} title={`Submitted ${artifact.notation} ${index + 1}`} />
            ) : typeof dsl === "string" ? (
              <DiagramPreview
                title={artifact.notation}
                content={dsl}
                format="MERMAID"
                style="clean"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This generated projection is preserved as model/layout JSON. Download its exact
                payload below.
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadArtifact(
                  `submitted-diagram-${index + 1}.json`,
                  JSON.stringify(payload, null, 2),
                )
              }
            >
              Download diagram JSON
            </Button>
          </section>
        );
      })}
    </DetailPanel>
  );
}
