"use client";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import { SelectablePreview, download } from "./selectable-diagram-preview";
import { DrawioEditor } from "./drawio-editor";
import { ScenarioDiagram } from "./scenario-diagram";
import {
  diagramKinds,
  selectDiagram,
  diagramMembers,
  type DiagramFamily,
  type DiagramKind,
} from "./diagram-catalog";
import { generateDrawio } from "@/lib/drawio/generate";
import { layoutLocally } from "./drawio-local-layout";
export function ArchitectureDiagrams({
  model,
  selectedId,
  onSelect,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [family, setFamily] = useState<DiagramFamily>("C4"),
    [kind, setKind] = useState<DiagramKind>("CONTAINER"),
    [service, setService] = useState(""),
    [editing, setEditing] = useState(false),
    [generated, setGenerated] = useState(""),
    [error, setError] = useState("");
  const [group, setGroup] = useState<string | null>(null);
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
  const selection = useMemo(
    () => selectDiagram(model, kind, container?.id),
    [model, kind, container?.id],
  );
  const document = selection.document,
    key = selection.key;
  const saved = useApiQuery(
    "architectureDocument",
    { modelId: model.id, viewId: key },
    { enabled: api.mode === "backend" && !!document },
  );
  useEffect(() => {
    let live = true;
    setGenerated("");
    setError("");
    setGroup(null);
    if (!document) return;
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
  }, [document]);
  const xml = saved.data?.xml ?? generated;
  function pick(id: string) {
    if (
      model.elements.some((node) => node.id === id) ||
      model.edges.some((edge) => edge.id === id)
    ) {
      setGroup(null);
      onSelect(id);
      return;
    }
    const members = document ? diagramMembers(document, id, model) : [];
    if (members.length === 1) {
      setGroup(null);
      onSelect(members[0]!);
    } else if (members.length) setGroup(id);
  }
  const members = group && document ? diagramMembers(document, group, model) : [];
  const title =
    kind === "COMPONENT"
      ? `C4 · Component · ${container?.name ?? "Service"}`
      : `${family} · ${diagramKinds[family].find((item) => item.value === kind)?.label ?? kind}`;
  function change(kind: DiagramKind) {
    setKind(kind);
    setEditing(false);
    setGroup(null);
  }
  return (
    <section aria-label="Architecture diagrams" className="min-w-0 space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Diagram family"
            value={family}
            onChange={(value) => {
              setFamily(value as DiagramFamily);
              change(value === "C4" ? "CONTAINER" : "LOGICAL");
            }}
            options={[
              { value: "C4", label: "C4" },
              { value: "4+1", label: "4+1 View Model" },
            ]}
          />
          <SelectField
            label="Diagram type"
            value={kind}
            onChange={(value) => change(value as DiagramKind)}
            options={diagramKinds[family]}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {diagramKinds[family].find((item) => item.value === kind)?.description}
        </p>
        {["COMPONENT", "LOGICAL"].includes(kind) && (
          <SelectField
            label="Service"
            value={container?.id ?? ""}
            onChange={(value) => {
              setService(value);
              setEditing(false);
            }}
            options={containers.map((node) => ({
              value: node.id,
              label: `${node.name}${node.count === 0 ? " · no components extracted" : ""}`,
            }))}
          />
        )}
      </div>
      {kind === "SCENARIOS" ? (
        <ScenarioDiagram model={model} onSelect={onSelect} />
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
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
                  {editing ? "View diagram" : "Edit in draw.io"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => download(xml, "mavis-diagram.drawio", "application/xml")}
                >
                  Download .drawio
                </Button>
                {saved.data?.revision ? (
                  <span className="text-xs text-muted-foreground">
                    Saved revision {saved.data.revision}
                  </span>
                ) : null}
              </div>
              {editing ? (
                <DrawioEditor
                  key={`${model.id}:${key}`}
                  modelId={model.id}
                  diagramId={key}
                  title={title}
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
              ) : (
                <SelectablePreview
                  key={`${model.id}:${key}:${saved.data?.revision ?? 0}`}
                  xml={xml}
                  title={title}
                  selectedId={selectedId}
                  onSelect={pick}
                />
              )}
              {members.length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm">
                    This shape represents {members.length} model elements or relationships. Choose
                    one to explore 3E.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {members.map((id) => {
                      const node = model.elements.find((n) => n.id === id),
                        edge = model.edges.find((e) => e.id === id);
                      return (
                        <Button key={id} size="sm" variant="outline" onClick={() => onSelect(id)}>
                          {node?.name ??
                            `${model.elements.find((n) => n.id === edge?.from)?.name} → ${model.elements.find((n) => n.id === edge?.to)?.name}`}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
