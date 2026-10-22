"use client";
import { useState } from "react";
import { useApiMutation } from "@/hooks/use-api";
import { useModel } from "./use-model";
import { ModelVersionSelector, ElementDetailsPanel } from "./components";
import { ConfirmDialog, FormField, SelectField } from "@/components/shared/forms";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { RequestState, ErrorState, EmptyState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ArchitecturalModel, ArchitectureElement } from "@/types/domain";
export function ModelEditor() {
  const state = useModel();
  const [draft, setDraft] = useState<{ modelId: string; dirty: boolean } | null>(null);
  const dirty = draft?.modelId === state.model?.id && Boolean(draft?.dirty);
  return state.projectId ? (
    <RequestState query={state.query} empty={!state.models.length}>
      {state.model && (
        <>
          <div className={dirty ? "pointer-events-none opacity-50" : ""} inert={dirty}>
            <ModelVersionSelector
              models={state.models}
              value={state.model.id}
              onChange={state.selectModel}
            />
          </div>
          <ModelDraft
            key={state.model.id}
            model={state.model}
            onDirty={(next) => setDraft({ modelId: state.model?.id ?? "", dirty: next })}
            onSaved={(id) => {
              setDraft(null);
              state.selectModel(id);
            }}
          />
        </>
      )}
    </RequestState>
  ) : null;
}
function ModelDraft({
  model,
  onDirty,
  onSaved,
}: {
  model: ArchitecturalModel;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const [elementId, setElementId] = useState(model.elements[0]?.id ?? "");
  const element = model.elements.find((e) => e.id === elementId);
  return element ? (
    <ElementDraft
      key={elementId}
      element={element}
      model={model}
      onDirty={onDirty}
      onSaved={onSaved}
      onElement={setElementId}
    />
  ) : (
    <EmptyState title="No editable elements" />
  );
}
function ElementDraft({
  element,
  model,
  onDirty,
  onSaved,
  onElement,
}: {
  element: ArchitectureElement;
  model: ArchitecturalModel;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: string) => void;
  onElement: (id: string) => void;
}) {
  const [description, setDescription] = useState(element.description);
  const [confirm, setConfirm] = useState(false);
  const save = useApiMutation("saveModel");
  const dirty = description !== element.description;
  const valid = description.trim().length > 0 && description.length <= 2000;
  function edit(value: string) {
    setDescription(value);
    onDirty(value !== element.description);
  }
  async function commit() {
    try {
      const revision = await save.mutateAsync({
        modelId: model.id,
        expectedRevision: model.revision,
        elementId: element.id,
        description,
      });
      setConfirm(false);
      onSaved(revision.id);
    } catch {
      /* Keep the draft and confirmation for recovery. */
    }
  }
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <DetailPanel title="Edit supported model information">
        <SelectField
          label="Element"
          value={element.id}
          onChange={onElement}
          disabled={dirty || save.isPending}
          options={model.elements.map((e) => ({ value: e.id, label: e.name }))}
        />
        {dirty && (
          <StatusBadge
            status="Unsaved draft · switch versions after saving or discarding"
            variant="warning"
          />
        )}
        <FormField label="Description" error={!valid ? "Enter 1–2000 characters." : undefined}>
          {(props) => (
            <Textarea
              {...props}
              value={description}
              disabled={save.isPending}
              maxLength={2000}
              onChange={(e) => edit(e.target.value)}
            />
          )}
        </FormField>
        <div className="flex gap-3">
          <Button disabled={!dirty || !valid || save.isPending} onClick={() => setConfirm(true)}>
            Review new revision
          </Button>
          <Button
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => edit(element.description)}
          >
            Discard draft
          </Button>
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Save a new model revision?"
          description={`Based on revision ${model.revision}. The current model and existing submissions remain frozen.`}
          pending={save.isPending}
          onConfirm={() => {
            void commit();
          }}
          error={save.isError ? <ErrorState error={save.error} /> : undefined}
        >
          <p className="whitespace-pre-wrap text-sm">{description}</p>
        </ConfirmDialog>
      </DetailPanel>
      <ElementDetailsPanel model={model} selectedId={element.id} />
    </div>
  );
}
export function CompareModels() {
  const state = useModel();
  const [beforeId, setBefore] = useState("");
  const [afterId, setAfter] = useState("");
  const before = state.models.find((m) => m.id === beforeId) ?? state.models[0];
  const after = state.models.find((m) => m.id === afterId) ?? state.models.at(-1);
  return state.projectId ? (
    <RequestState
      query={state.query}
      empty={state.models.length < 2}
      emptyMessage="Analyze another source or save a new revision to compare versions."
    >
      {before && after && (
        <div className="grid gap-5 xl:grid-cols-2">
          <DetailPanel title="Earlier model">
            <ModelVersionSelector models={state.models} value={before.id} onChange={setBefore} />
            <p className="text-xs text-muted-foreground">Source {before.snapshotId}</p>
            {before.elements.map((e) => (
              <p key={e.id} className="text-sm">
                {e.name}: {e.description}
              </p>
            ))}
          </DetailPanel>
          <DetailPanel title="Comparison model">
            <ModelVersionSelector models={state.models} value={after.id} onChange={setAfter} />
            <p className="text-xs text-muted-foreground">Source {after.snapshotId}</p>
            {after.elements.map((e) => (
              <p key={e.id} className="text-sm">
                <StatusBadge
                  status={
                    before.elements.find((b) => b.id === e.id)?.description === e.description
                      ? "Unchanged"
                      : "Changed"
                  }
                />{" "}
                {e.name}: {e.description}
              </p>
            ))}
          </DetailPanel>
        </div>
      )}
    </RequestState>
  ) : null;
}
