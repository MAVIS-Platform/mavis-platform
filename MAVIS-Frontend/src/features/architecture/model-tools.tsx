"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApi, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { DetailPanel } from "@/components/shared/data";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
export function ModelTools({ modelId }: { modelId: string }) {
  const api = useApi();
  return api.mode === "backend" ? <BackendTools key={modelId} modelId={modelId} /> : null;
}
function BackendTools({ modelId }: { modelId: string }) {
  const api = useApi();
  const diagrams = useApiQuery("diagrams", { modelId });
  const [diagram, setDiagram] = useState("");
  const [format, setFormat] = useState<"MERMAID" | "PLANTUML" | "DRAWIO_XML" | "JSON">("MERMAID");
  const download = useMutation({
    mutationFn: async () => {
      const diagramId = diagram || diagrams.data?.[0]?.id;
      if (!diagramId) throw new Error("Select a diagram");
      const data = await api.execute("exportDiagram", { modelId, diagramId, format });
      const ext = { MERMAID: "mmd", PLANTUML: "puml", DRAWIO_XML: "drawio", JSON: "json" };
      const url = URL.createObjectURL(
        new Blob([data.content], {
          type: format === "JSON" ? "application/json" : "text/plain;charset=utf-8",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `mavis-${modelId}.${ext[format]}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const runs = useApiQuery("evaluations", { modelId });
  const evaluate = useApiMutation("evaluateModel");
  const [run, setRun] = useState("");
  const selected = run || evaluate.data?.id || runs.data?.[0]?.id || "";
  const findings = useApiQuery(
    "evaluationFindings",
    { evaluationId: selected, modelId },
    { enabled: !!selected },
  );
  const score = (
    evaluate.data?.id === selected ? evaluate.data : runs.data?.find((r) => r.id === selected)
  )?.result["complianceScore"];
  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      <DetailPanel title="Architecture diagrams">
        <RequestState query={diagrams} empty={!diagrams.data?.length}>
          <SelectField
            label="Diagram"
            value={diagram || diagrams.data?.[0]?.id || ""}
            onChange={setDiagram}
            options={(diagrams.data ?? []).map((d) => ({
              value: d.id,
              label: `${d.notation} · ${d.level}`,
            }))}
          />
          <SelectField
            label="Export format"
            value={format}
            onChange={(v) => setFormat(v as typeof format)}
            options={["MERMAID", "PLANTUML", "DRAWIO_XML", "JSON"].map((value) => ({
              value,
              label: value,
            }))}
          />
          <Button
            className="mt-3"
            disabled={download.isPending || !diagrams.data?.length}
            onClick={() => download.mutate()}
          >
            Download diagram
          </Button>
          {download.isError && <ErrorState error={download.error} />}
        </RequestState>
      </DetailPanel>
      <DetailPanel title="Architecture evaluation">
        <Button disabled={evaluate.isPending} onClick={() => evaluate.mutate({ modelId })}>
          {evaluate.isPending ? "Evaluating…" : "Evaluate selected model"}
        </Button>
        {evaluate.isError && <ErrorState error={evaluate.error} />}
        <RequestState query={runs}>
          <SelectField
            label="Evaluation run"
            value={selected}
            onChange={setRun}
            options={(runs.data ?? []).map((r) => ({ value: r.id, label: r.id.slice(0, 8) }))}
          />
          {selected ? (
            <>
              <p className="my-3 text-sm">
                Compliance score: {typeof score === "number" ? score : "Not reported"}
              </p>
              <RequestState
                query={findings}
                empty={!findings.data?.length}
                emptyMessage="No findings recorded for this evaluation."
              >
                {findings.data?.map((f, i) => (
                  <article key={String(f["id"] ?? i)} className="my-2 rounded border p-3">
                    <p className="text-xs">
                      {String(f["severity"] ?? "")} · {String(f["status"] ?? "")}
                    </p>
                    <p className="text-sm">{String(f["message"] ?? "")}</p>
                  </article>
                ))}
              </RequestState>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              This model has not been evaluated yet.
            </p>
          )}
        </RequestState>
      </DetailPanel>
    </div>
  );
}
