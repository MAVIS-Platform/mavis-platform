"use client";
import { useMemo, useState } from "react";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
import type { ArchitecturalModel } from "@/types/domain";
import { modelSchema } from "@/types/domain";
import { ArchitectureGraph, ElementDetailsPanel } from "./components";
import { DrawioEditor } from "./drawio-editor";
import { DiagramPreview } from "./diagram-preview";
import type { DiagramFormat, DrawingStyle } from "./diagram-renderer";
import { z } from "zod";
const layoutSchema = z.object({
  layoutJson: z.object({
    nodes: z.array(z.object({ id: z.string() })),
    edges: z.array(z.object({ id: z.string() })),
  }),
});
type Props = {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};
export function ArchitecturePresentation(props: Props) {
  const api = useApi();
  return api.mode === "backend" ? (
    <BackendPresentation key={props.model.id} {...props} />
  ) : (
    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <ArchitectureGraph {...props} />
      <ElementDetailsPanel {...props} />
    </div>
  );
}
function BackendPresentation({ model, selectedId, onSelect }: Props) {
  const diagrams = useApiQuery("diagrams", { modelId: model.id });
  const [choice, setChoice] = useState("network");
  const [format, setFormat] = useState<DiagramFormat>("MERMAID");
  const [style, setStyle] = useState<DrawingStyle>("clean");
  const [downloadError, setDownloadError] = useState(false);
  const selectedDiagram = diagrams.data?.find((diagram) => diagram.id === choice);
  const [container, setContainer] = useState("");
  const [relationshipView, setRelationshipView] = useState<
    "all" | "source" | "declared" | "runtime"
  >("all");
  const componentScope =
    format === "DRAWIO_XML" &&
    selectedDiagram?.notation === "C4" &&
    selectedDiagram.level === "COMPONENT";
  const containers = model.elements
    .filter((node) => node.elementType === "SERVICE_CONTAINER")
    .sort((a, b) => a.name.localeCompare(b.name));
  const containerId = componentScope ? container || containers[0]?.id : undefined;
  const input = {
    modelId: model.id,
    diagramId: selectedDiagram?.id ?? "",
    format,
    containerId,
    theme: style,
    relationshipView: format === "DRAWIO_XML" ? relationshipView : undefined,
  };
  const source = useApiQuery("exportDiagram", input, { enabled: !!selectedDiagram });
  const structure = useApiQuery(
    "exportDiagram",
    { ...input, format: "JSON" },
    { enabled: !!selectedDiagram },
  );
  const scoped = useMemo(() => {
    if (!selectedDiagram || !structure.data) return null;
    try {
      const layout = layoutSchema.parse(JSON.parse(structure.data.content)).layoutJson;
      const nodeIds = new Set(layout.nodes.map((node) => node.id));
      const edgeIds = new Set(layout.edges.map((edge) => edge.id));
      const elements = model.elements.filter((node) => nodeIds.has(node.id));
      const edges = model.edges.filter((edge) => edgeIds.has(edge.id));
      if (elements.length !== nodeIds.size || edges.length !== edgeIds.size) return null;
      return modelSchema.parse({ ...model, elements, edges });
    } catch {
      return null;
    }
  }, [model, selectedDiagram, structure.data]);
  const previewModel = choice === "network" ? model : scoped;
  const title = selectedDiagram
    ? `${selectedDiagram.notation} · ${selectedDiagram.level}`
    : "Interactive network";
  function activateRenderer() {
    if (choice !== "network") return;
    const dependency =
      diagrams.data?.find((diagram) => diagram.notation === "DEPENDENCY_GRAPH") ??
      diagrams.data?.[0];
    if (dependency) {
      setChoice(dependency.id);
      onSelect(null);
    }
  }
  function download() {
    if (!source.data) return;
    setDownloadError(false);
    try {
      const extensions = { MERMAID: "mmd", PLANTUML: "puml", DRAWIO_XML: "drawio", JSON: "json" };
      const url = URL.createObjectURL(
        new Blob([source.data.content], {
          type: format === "JSON" ? "application/json" : "text/plain;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mavis-${selectedDiagram?.notation}-${selectedDiagram?.level}.${extensions[format]}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    }
  }
  return (
    <div className="mt-5 space-y-4">
      <section
        className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
        aria-label="Diagram controls"
      >
        <h2 className="text-sm font-semibold">Architecture diagrams</h2>
        <RequestState query={diagrams}>
          <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Diagram"
              value={choice}
              onChange={(value) => {
                setChoice(value);
                onSelect(null);
              }}
              options={[
                { value: "network", label: "Interactive network · all elements" },
                ...(diagrams.data ?? []).map((diagram) => ({
                  value: diagram.id,
                  label: `${diagram.notation} · ${diagram.level}`,
                })),
              ]}
            />
            <SelectField
              label="Renderer / export format"
              value={format}
              onChange={(value) => {
                setFormat(value as DiagramFormat);
                activateRenderer();
              }}
              options={["MERMAID", "PLANTUML", "DRAWIO_XML", "JSON"].map((value) => ({
                value,
                label: value,
              }))}
            />
            <SelectField
              label="Drawing style"
              value={style}
              onChange={(value) => {
                setStyle(value as DrawingStyle);
                if (format === "JSON") setFormat("MERMAID");
                activateRenderer();
              }}
              options={[
                { value: "clean", label: "Clean" },
                { value: "dark", label: "Dark" },
                { value: "blueprint", label: "Blueprint" },
              ]}
            />
            <Button
              disabled={!source.data || source.isFetching || choice === "network"}
              onClick={download}
            >
              Download generated diagram
            </Button>
          </div>
          {format === "DRAWIO_XML" && (
            <SelectField
              label="Relationships"
              value={relationshipView}
              onChange={(value) => {
                setRelationshipView(value as typeof relationshipView);
                onSelect(null);
              }}
              options={[
                { value: "all", label: "All relationships" },
                { value: "source", label: "Source inferred" },
                { value: "declared", label: "Declared configuration" },
                { value: "runtime", label: "Runtime observed" },
              ]}
            />
          )}
          {componentScope && (
            <SelectField
              label="Component container"
              value={containerId ?? ""}
              onChange={(value) => {
                setContainer(value);
                onSelect(null);
              }}
              options={containers.map((node) => ({ value: node.id, label: node.name }))}
            />
          )}
          {choice === "network" ? (
            <p className="text-xs text-muted-foreground">
              Choose a C4 or dependency diagram above. Selecting a renderer or drawing style
              switches to the generated dependency diagram.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Diagram, renderer and drawing style update the preview below. DRAWIO_XML opens the
              local draw.io editor; JSON displays diagram data.
            </p>
          )}
          {downloadError && (
            <p role="alert" className="text-sm text-destructive">
              Download failed. Please try again.
            </p>
          )}
        </RequestState>
      </section>
      <div
        className={
          format === "DRAWIO_XML" && choice !== "network"
            ? "grid min-w-0 grid-cols-1 gap-4"
            : "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
        }
      >
        <div className="min-w-0 space-y-3">
          {choice === "network" ? (
            <ArchitectureGraph model={model} selectedId={selectedId} onSelect={onSelect} />
          ) : (
            <RequestState query={source}>
              {source.data &&
                (format === "DRAWIO_XML" && selectedDiagram ? (
                  <DrawioEditor
                    key={`${model.id}:${selectedDiagram.id}:${containerId ?? "overview"}:${relationshipView}`}
                    xml={source.data.content}
                    modelId={model.id}
                    diagramId={selectedDiagram.id}
                    title={title}
                    scope={`${containerId ?? "overview"}:${relationshipView}`}
                    theme={style}
                  />
                ) : (
                  <DiagramPreview
                    key={`${selectedDiagram?.id}:${format}:${style}`}
                    content={source.data.content}
                    format={format}
                    style={style}
                    title={title}
                  />
                ))}
            </RequestState>
          )}
          {choice !== "network" && format !== "DRAWIO_XML" && (
            <RequestState query={structure}>
              {structure.data && !scoped ? (
                <p role="alert" className="text-sm text-destructive">
                  Diagram data does not match the selected model.
                </p>
              ) : (
                previewModel && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-3 text-xs text-muted-foreground">
                      Inspect diagram element ({previewModel.elements.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {previewModel.elements.map((node) => (
                        <Button
                          key={node.id}
                          size="sm"
                          variant={node.id === selectedId ? "secondary" : "outline"}
                          onClick={() => onSelect(node.id)}
                        >
                          {node.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </RequestState>
          )}
        </div>
        {previewModel && format !== "DRAWIO_XML" && (
          <ElementDetailsPanel model={previewModel} selectedId={selectedId} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}
