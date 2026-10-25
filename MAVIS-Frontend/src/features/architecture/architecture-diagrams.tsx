"use client";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import { DrawioEditor } from "./drawio-editor";
import { ScenarioDiagram } from "./scenario-diagram";
import { UmlDiagramWorkspace } from "./uml-diagram-workspace";
import type { UmlDiagramKind } from "./uml-diagrams";
import {
  diagramKinds,
  selectDiagram,
  type DiagramKind,
} from "./diagram-catalog";
import { generateDrawio } from "@/lib/drawio/generate";
import { layoutLocally } from "./drawio-local-layout";
import type { SequenceSelectionContext } from "./three-e-content";

const diagramOptions = [...diagramKinds.C4, ...diagramKinds.UML];
const popularKinds: DiagramKind[] = ["CONTAINER", "CONTEXT", "UML_SEQUENCE", "UML_CLASS"];
const popularOptions = popularKinds.flatMap((value) =>
  diagramOptions.filter((item) => item.value === value),
);

export function ArchitectureDiagrams({
  model,
  selectedId,
  onSelect,
  onSelectSequence,
  systemName,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectSequence?: ((id: string | null, seqCtx: SequenceSelectionContext | null) => void) | undefined;
  systemName?: string | undefined;
}) {
  const [kind, setKind] = useState<DiagramKind>("CONTAINER"),
    [service, setService] = useState(""),
    [generated, setGenerated] = useState(""),
    [error, setError] = useState("");
  const api = useApi(),
    cache = useQueryClient();
  const containers = model.elements
    .filter((node) => node.elementType === "SERVICE_CONTAINER")
    .map((node) => ({
      ...node,
      count: model.elements.filter((child) => child.parentId === node.id).length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const container = containers.find((node) => node.id === service) ?? containers[0];
  const isUmlWorkspaceKind = [
    "UML_CLASS",
    "UML_PACKAGE",
    "UML_DEPLOYMENT",
    "UML_ACTIVITY",
    "UML_STATE",
  ].includes(kind);
  const selection = useMemo(
    () => selectDiagram(model, kind, container?.id, { systemName }),
    [model, kind, container?.id, systemName],
  );
  const document = selection.document,
    key = selection.key;
  const saved = useApiQuery(
    "architectureDocument",
    { modelId: model.id, viewId: key },
    { enabled: api.mode === "backend" && !!document && !isUmlWorkspaceKind },
  );
  useEffect(() => {
    let live = true;
    setGenerated("");
    setError("");
    if (!document || isUmlWorkspaceKind) return;
    void generateDrawio(document, "clean", layoutLocally)
      .then((xml) => {
        if (live) setGenerated(xml);
      })
      .catch((error) => {
        if (live) setError(error instanceof Error ? error.message : "Diagram layout failed");
      });
    return () => {
      live = false;
    };
  }, [document, isUmlWorkspaceKind]);
  const xml = saved.data?.xml ?? generated;
  const currentOption = diagramOptions.find((item) => item.value === kind);
  const title =
    kind === "COMPONENT"
      ? `Component · ${container?.name ?? "Service"}`
      : (currentOption?.label ?? kind);
  function change(nextKind: DiagramKind) {
    setKind(nextKind);
    if (nextKind !== "SCENARIOS" && nextKind !== "UML_SEQUENCE" && onSelectSequence) {
      onSelectSequence(null, null);
    }
  }
  return (
    <section aria-label="Architecture diagrams" className="min-w-0 space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Most popular:</span>
          {popularOptions.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={kind === item.value ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => change(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <SelectField
          label="Diagram type"
          value={kind}
          onChange={(value) => change(value as DiagramKind)}
          options={diagramOptions}
        />
        <p className="text-sm text-muted-foreground">{currentOption?.description}</p>
        {["COMPONENT", "LOGICAL"].includes(kind) && (
          <SelectField
            label="Service"
            value={container?.id ?? ""}
            onChange={setService}
            options={containers.map((node) => ({
              value: node.id,
              label: `${node.name}${node.count === 0 ? " · no components extracted" : ""}`,
            }))}
          />
        )}
        {["UML_CLASS", "UML_PACKAGE"].includes(kind) && (
          <SelectField
            label="Service Scope"
            value={service}
            onChange={setService}
            options={[
              { value: "", label: "All Services (System-wide)" },
              ...containers.map((node) => ({
                value: node.id,
                label: node.name,
              })),
            ]}
          />
        )}
      </div>
      {kind === "SCENARIOS" || kind === "UML_SEQUENCE" ? (
        <ScenarioDiagram
          model={model}
          selectedId={selectedId}
          onSelect={onSelect}
          onSelectSequence={onSelectSequence}
        />
      ) : isUmlWorkspaceKind ? (
        <UmlDiagramWorkspace
          model={model}
          kind={kind as UmlDiagramKind}
          serviceId={service || undefined}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : !document ? (
        <p role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          {selection.reason}
        </p>
      ) : (
        <>
          {selection.notice && <p className="text-xs text-muted-foreground">{selection.notice}</p>}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : !xml ? (
            <p role="status">Preparing diagram…</p>
          ) : (
            <DrawioEditor
              key={`${model.id}:${key}`}
              modelId={model.id}
              diagramId={key}
              title={title}
              notation={document.notation}
              level={document.level}
              scope={key}
              xml={xml}
              generatedXml={generated || xml}
              preferProvidedXml={!!saved.data?.xml}
              onSave={async (content) => {
                if (!saved.data || saved.error)
                  throw Error("The saved version could not load. Retry before saving.");
                const result = await api.execute("saveArchitectureDocument", {
                  modelId: model.id,
                  viewId: key,
                  expectedRevision: saved.data.revision,
                  xml: content,
                });
                cache.setQueryData(
                  ["api", "architectureDocument", { modelId: model.id, viewId: key }],
                  result,
                );
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
