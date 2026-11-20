"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import { RequestState } from "@/components/shared/request-state";
import { DrawioEditor } from "./drawio-editor";
import { DrawioSnapshot } from "./drawio-snapshot";
import { DiagramPreview } from "./diagram-preview";
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ArchitectureWorkbook({ modelId }: { modelId: string }) {
  const api = useApi();
  const cache = useQueryClient();
  const pack = useApiQuery("architectureViews", { modelId });
  const [choice, setChoice] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [packing, setPacking] = useState(false);
  const [error, setError] = useState("");
  const view = pack.data?.views.find((view) => view.id === choice) ?? pack.data?.views[0];
  const rendered = useApiQuery(
    "renderArchitectureView",
    { modelId, viewId: view?.id ?? "" },
    { enabled: !!view },
  );
  const saved = useApiQuery(
    "architectureDocument",
    { modelId, viewId: view?.id ?? "" },
    { enabled: !!view },
  );
  const historical = useApiQuery(
    "architectureDocument",
    { modelId, viewId: view?.id ?? "", revision: historyRevision || undefined },
    { enabled: !!view && historyRevision > 0 },
  );
  const xml = (historyRevision ? historical.data?.xml : saved.data?.xml) ?? rendered.data?.content;
  async function save(xml: string) {
    if (!view || !saved.data || saved.error)
      throw Error("Load the latest saved document before saving.");
    const result = await api.execute("saveArchitectureDocument", {
      modelId,
      viewId: view.id,
      expectedRevision: saved.data.revision,
      xml,
    });
    cache.setQueryData(["api", "architectureDocument", { modelId, viewId: view.id }], result);
  }
  async function exportPack() {
    if (!pack.data) return;
    setPacking(true);
    setError("");
    try {
      const output = document.implementation.createDocument(null, "mxfile");
      output.documentElement.setAttribute("host", "MAVIS");
      output.documentElement.setAttribute("mavisModelId", modelId);
      for (const view of pack.data.views) {
        const saved = await api.execute("architectureDocument", { modelId, viewId: view.id });
        const xml =
          saved.xml ??
          (await api.execute("renderArchitectureView", { modelId, viewId: view.id })).content;
        const parsed = new DOMParser().parseFromString(xml, "text/xml");
        if (parsed.querySelector("parsererror")) throw Error("Invalid diagram document");
        const diagram = parsed.querySelector("diagram");
        if (!diagram) throw Error("Diagram page is missing");
        const page = output.importNode(diagram, true);
        page.setAttribute("id", view.id);
        page.setAttribute("name", view.title);
        output.documentElement.appendChild(page);
      }
      download(
        new XMLSerializer().serializeToString(output),
        `mavis-${modelId}-architecture.drawio`,
        "application/xml;charset=utf-8",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not export architecture pack");
    } finally {
      setPacking(false);
    }
  }
  return (
    <section className="mt-5 min-w-0 space-y-4" aria-label="Architecture documents">
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Architecture documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore application architecture, service internals and deployment dependencies.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!pack.data || packing}
            onClick={() => void exportPack()}
          >
            {packing ? "Preparing pages…" : "Download all views (.drawio)"}
          </Button>
        </div>
        <RequestState query={pack}>
          {pack.data && (
            <>
              <SelectField
                label="Architecture view"
                value={view?.id ?? ""}
                onChange={(value) => {
                  setChoice(value);
                  setHistoryRevision(0);
                  setEditing(false);
                  setError("");
                }}
                options={pack.data.views.map((view) => ({ value: view.id, label: view.title }))}
              />
              <p className="text-sm text-muted-foreground">{view?.purpose}</p>
              <div className="flex flex-wrap gap-2">
                {pack.data.views
                  .filter((item) =>
                    ["overview", "containers", "messaging", "deployment"].includes(item.id),
                  )
                  .map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      variant={view?.id === item.id ? "default" : "outline"}
                      onClick={() => {
                        setChoice(item.id);
                        setHistoryRevision(0);
                        setEditing(false);
                      }}
                    >
                      {item.title}
                    </Button>
                  ))}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">Coverage and review status</summary>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p>
                    Semantic review required · {pack.data.coverage["elements"]} elements ·{" "}
                    {pack.data.coverage["relationships"]} relationships
                  </p>
                  <p>
                    {pack.data.coverage["unresolvedElements"]} unresolved elements ·{" "}
                    {pack.data.coverage["relationshipsWithoutResolutionMetadata"]} relationships
                    without resolution metadata
                  </p>
                  {pack.data.findings.map((finding) => (
                    <p key={finding.elementId}>
                      {finding.name}: {finding.code.replaceAll("_", " ").toLowerCase()}
                    </p>
                  ))}
                  {pack.data.limitations.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </details>
            </>
          )}
        </RequestState>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {view && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={editing ? "outline" : "default"} onClick={() => setEditing(false)}>
            View diagram
          </Button>
          <Button variant={editing ? "default" : "outline"} onClick={() => setEditing(true)}>
            Interactive SVG
          </Button>
          {saved.data && saved.data.revision > 0 && (
            <SelectField
              label="Document revision"
              value={String(historyRevision)}
              onChange={(value) => {
                setHistoryRevision(Number(value));
                setEditing(false);
              }}
              options={[
                { value: "0", label: "Latest saved revision" },
                ...Array.from({ length: Math.min(saved.data.revision, 50) }, (_, i) => ({
                  value: String(saved.data!.revision - i),
                  label: `Revision ${saved.data!.revision - i}`,
                })),
              ]}
            />
          )}
          <span className="text-xs text-muted-foreground">
            {saved.data?.revision
              ? `Saved revision ${saved.data.revision}`
              : "Generated from model"}
          </span>
        </div>
      )}
      {saved.error && (
        <p role="alert" className="text-sm text-destructive">
          Saved document could not load. Generated preview remains available; saving is disabled
          until the document reloads.
        </p>
      )}
      <RequestState query={rendered}>
        {xml &&
          view &&
          (editing ? (
            <DrawioEditor
              key={`${modelId}:${view.id}:${historyRevision}`}
              xml={xml}
              generatedXml={rendered.data?.content ?? xml}
              preferProvidedXml={!!saved.data?.xml}
              modelId={modelId}
              diagramId={view.id}
              notation={view.document && typeof view.document === "object" && "notation" in view.document ? String(view.document.notation) : undefined}
              level={view.document && typeof view.document === "object" && "level" in view.document ? String(view.document.level) : undefined}
              title={`${view.document && typeof view.document === "object" && "notation" in view.document ? String(view.document.notation) : "C4"} · ${view.kind === "component" ? "COMPONENT" : view.kind === "container" ? "CONTAINER" : view.kind === "overview" ? "SYSTEM" : "SERVICE"}`}
              scope={view.id}
              onSave={save}
            />
          ) : (
            <WorkbookPreview
              key={`${view.id}:${saved.data?.revision ?? 0}:${historyRevision}`}
              xml={xml}
              title={view.title}
            />
          ))}
      </RequestState>
    </section>
  );
}
function WorkbookPreview({ xml, title }: { xml: string; title: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="space-y-3">
      <DrawioSnapshot xml={xml} onRender={setSvg} onError={setError} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !svg ? (
        <p role="status" className="text-sm text-muted-foreground">
          Rendering architecture diagram…
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => download(svg, "mavis-diagram.svg", "image/svg+xml")}
            >
              Download SVG
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const popup = window.open("", "_blank");
                if (!popup) {
                  setError("Allow the print window to save a PDF.");
                  return;
                }
                const asset = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
                popup.document.write(
                  '<!doctype html><html><head><title>MAVIS architecture</title><style>@page{size:A3 landscape;margin:12mm}body{margin:0}img{width:100%;height:270mm;object-fit:contain;display:block;margin:auto}</style></head><body><img alt="Architecture diagram"></body></html>',
                );
                popup.document.close();
                const image = popup.document.querySelector("img")!;
                image.onload = () => popup.print();
                image.src = asset;
                popup.addEventListener("afterprint", () => URL.revokeObjectURL(asset), {
                  once: true,
                });
              }}
            >
              Print / Save PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => download(xml, "mavis-diagram.drawio", "application/xml")}
            >
              Download .drawio
            </Button>
          </div>
          <DiagramPreview content="" format="MERMAID" style="clean" title={title} svg={svg} />
        </>
      )}
    </div>
  );
}
