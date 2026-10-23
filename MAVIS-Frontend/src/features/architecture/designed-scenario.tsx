"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/shared/forms";
import { relationLabel } from "@/lib/drawio/rules";
import { SelectablePreview, download } from "./selectable-diagram-preview";
import { readScenarioDesign, scenarioInteractions, scenarioXml } from "./scenario-design";

export function DesignedScenario({
  model,
  onSelect,
}: {
  model: ArchitecturalModel;
  onSelect: (id: string) => void;
}) {
  const api = useApi(),
    cache = useQueryClient();
  const viewId = "scenarios:designed";
  const saved = useApiQuery(
    "architectureDocument",
    { modelId: model.id, viewId },
    { enabled: api.mode === "backend" },
  );
  const loaded = useRef(false);
  const [name, setName] = useState("Application collaboration"),
    [edgeIds, setEdgeIds] = useState<string[]>([]),
    [chosen, setChosen] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  const interactions = scenarioInteractions(model);
  useEffect(() => {
    if (loaded.current || !saved.data) return;
    loaded.current = true;
    if (!saved.data.xml) return;
    const design = readScenarioDesign(saved.data.xml, model);
    if (design) {
      setName(design.name);
      setEdgeIds(design.edgeIds);
    } else
      setError(
        "The saved scenario cannot be restored for this model. Download it before replacing its steps.",
      );
  }, [saved.data, model]);
  const label = (id: string) => {
    const edge = interactions.find((edge) => edge.id === id);
    if (!edge) return "Unavailable interaction";
    const nodeName = (id: string) => {
      const node = model.elements.find((node) => node.id === id);
      const owner = model.elements.find((parent) => parent.id === node?.parentId);
      return `${node?.name ?? "Unknown"}${owner ? " (" + owner.name + ")" : ""}`;
    };
    return `${nodeName(edge.from)} → ${nodeName(edge.to)} · ${relationLabel({ id, type: edge.protocol })}`;
  };
  let xml = "",
    issue = "";
  try {
    if (edgeIds.length) xml = scenarioXml(model, { modelId: model.id, name, edgeIds });
  } catch (error) {
    issue = error instanceof Error ? error.message : "Scenario generation failed";
  }
  function update(next: string[]) {
    setEdgeIds(next);
    setDirty(true);
    setError("");
  }
  async function save() {
    if (!xml || !saved.data || saved.error) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.execute("saveArchitectureDocument", {
        modelId: model.id,
        viewId,
        expectedRevision: saved.data.revision,
        xml,
      });
      cache.setQueryData(["api", "architectureDocument", { modelId: model.id, viewId }], result);
      setDirty(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Scenario could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Choose existing interactions in the order of a use case. This is a designed scenario;
          execution order and delivery have not been observed. Each participant opens 3E.
        </p>
        <label className="block space-y-2 text-xs">
          Scenario name
          <Input
            value={name}
            maxLength={120}
            disabled={api.mode === "backend" && !saved.data}
            onChange={(event) => {
              setName(event.target.value);
              setDirty(true);
            }}
          />
        </label>
        {interactions.length ? (
          <>
            <SelectField
              label="Add interaction"
              value={chosen || interactions[0]!.id}
              onChange={setChosen}
              options={interactions.map((edge) => ({ value: edge.id, label: label(edge.id) }))}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={edgeIds.length >= 30 || (saved.isPending && api.mode === "backend")}
              onClick={() => update([...edgeIds, chosen || interactions[0]!.id])}
            >
              Add step
            </Button>
          </>
        ) : (
          <p>
            No source-supported interactions are available. Analyze source relationships first, or
            use an observed runtime scenario.
          </p>
        )}
        <ol aria-label="Scenario steps" className="space-y-2">
          {edgeIds.map((id, i) => (
            <li
              key={`${i}:${id}`}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <Button
                size="sm"
                variant="ghost"
                className="h-auto min-w-0 flex-1 whitespace-normal break-words text-left"
                onClick={() => onSelect(id)}
              >
                {i + 1}. {label(id)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move step ${i + 1} up`}
                disabled={!i}
                onClick={() => {
                  const next = [...edgeIds];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  update(next);
                }}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move step ${i + 1} down`}
                disabled={i === edgeIds.length - 1}
                onClick={() => {
                  const next = [...edgeIds];
                  [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
                  update(next);
                }}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Remove step ${i + 1}`}
                onClick={() => update(edgeIds.filter((_, index) => index !== i))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
        {(error || issue) && (
          <p role="alert" className="text-sm text-destructive">
            {error || issue}
          </p>
        )}
        {saved.error && (
          <p role="alert" className="text-sm text-destructive">
            Saved scenario could not load.{" "}
            <button className="underline" onClick={() => void saved.refetch()}>
              Retry
            </button>
          </p>
        )}
        {xml && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!dirty || saving || !saved.data || !!saved.error || api.mode !== "backend"}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save scenario"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(xml, "mavis-scenario.drawio", "application/xml")}
            >
              Download .drawio
            </Button>
            <span role="status" className="text-xs text-muted-foreground">
              {dirty
                ? "Unsaved changes"
                : saved.data?.revision
                  ? `Saved revision ${saved.data.revision}`
                  : "Designed scenario"}
            </span>
          </div>
        )}
        {!edgeIds.length && (
          <p role="status" className="text-sm text-muted-foreground">
            Add the first interaction to create the sequence diagram.
          </p>
        )}
      </div>
      {xml && (
        <SelectablePreview
          xml={xml}
          title={`4+1 · Scenarios · ${name}`}
          selectedId={null}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
