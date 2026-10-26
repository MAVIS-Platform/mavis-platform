"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useModel } from "./use-model";
import { ModelVersionSelector, ElementDetailsPanel } from "./components";
import { SearchableThreeESelect, type ThreeESelectOption } from "./three-e-searchable-select";
import { ConfirmDialog, FormField, SelectField } from "@/components/shared/forms";
import { DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { RequestState, ErrorState, EmptyState } from "@/components/shared/request-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ArchitecturalModel, ArchitectureElement } from "@/types/domain";

type EditorMode = "edit-element" | "add-element" | "add-connection" | "remove-item";

const ELEMENT_TYPE_BADGE: Record<string, string> = {
  SERVICE_CONTAINER: "SVC",
  DATABASE: "DB",
  QUEUE_BROKER: "QUEUE",
  MESSAGE_CHANNEL: "CHANNEL",
  EXTERNAL_SYSTEM: "EXT",
  COMPONENT: "COMP",
  CLASS_INTERFACE: "CLASS",
};

const ELEMENT_TYPE_OPTIONS = [
  { value: "SERVICE_CONTAINER", label: "Service Container (Microservice)" },
  { value: "DATABASE", label: "Database / Data Store" },
  { value: "QUEUE_BROKER", label: "Queue / Message Broker" },
  { value: "EXTERNAL_SYSTEM", label: "External System" },
  { value: "COMPONENT", label: "Internal Component" },
  { value: "CLASS_INTERFACE", label: "Class / Interface" },
] as const;

const RELATION_TYPE_OPTIONS = [
  { value: "SERVICE_HTTP_CALL", label: "Service HTTP Call (REST / gRPC)" },
  { value: "DATABASE_ACCESS", label: "Database Access (Read / Write)" },
  { value: "CODE_DEPENDENCY", label: "Code Dependency" },
] as const;

const LAYER_OPTIONS = [
  { value: "unclassified", label: "Unclassified" },
  { value: "edge", label: "Edge / Gateway" },
  { value: "domain", label: "Domain Service" },
  { value: "platform", label: "Platform / Messaging" },
  { value: "data", label: "Data Persistence" },
] as const;

export function ModelEditor() {
  const state = useModel();
  const [draft, setDraft] = useState<{ modelId: string; dirty: boolean } | null>(null);
  const dirty = draft?.modelId === state.model?.id && Boolean(draft?.dirty);
  const newestRevision = Math.max(0, ...state.models.map((m) => m.revision));
  const isLatest = state.model ? state.model.revision === newestRevision : true;

  return state.projectId ? (
    <RequestState query={state.query} empty={!state.models.length}>
      {state.model && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className={`min-w-64 flex-1 ${dirty ? "pointer-events-none opacity-50" : ""}`} inert={dirty}>
              <ModelVersionSelector
                models={state.models}
                value={state.model.id}
                onChange={state.selectModel}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/diagrams?project=${state.projectId}&model=${state.model.id}`}>
                  Open Diagrams
                </Link>
              </Button>
              {state.models.length > 1 && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/compare?project=${state.projectId}`}>Compare Revisions</Link>
                </Button>
              )}
            </div>
          </div>

          {!isLatest && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
              <span>
                You are inspecting historical <strong>Revision {state.model.revision}</strong>. New
                revisions must branch from the latest revision (
                <strong>Revision {newestRevision}</strong>).
              </span>
              {state.models[0] && (
                <Button size="sm" variant="outline" onClick={() => state.selectModel(state.models[0]!.id)}>
                  Switch to Revision {newestRevision}
                </Button>
              )}
            </div>
          )}

          <ModelDraft
            key={state.model.id}
            model={state.model}
            isLatest={isLatest}
            onDirty={(next) => setDraft({ modelId: state.model?.id ?? "", dirty: next })}
            onSaved={(id) => {
              setDraft(null);
              state.selectModel(id);
            }}
          />
        </div>
      )}
    </RequestState>
  ) : null;
}

function ModelDraft({
  model,
  isLatest,
  onDirty,
  onSaved,
}: {
  model: ArchitecturalModel;
  isLatest: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const [elementId, setElementId] = useState(model.elements[0]?.id ?? "");
  const element = model.elements.find((e) => e.id === elementId) ?? model.elements[0];
  return element ? (
    <ElementDraft
      key={`${model.id}:${element.id}`}
      element={element}
      model={model}
      isLatest={isLatest}
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
  isLatest,
  onDirty,
  onSaved,
  onElement,
}: {
  element: ArchitectureElement;
  model: ArchitecturalModel;
  isLatest: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: string) => void;
  onElement: (id: string) => void;
}) {
  const [mode, setMode] = useState<EditorMode>("edit-element");
  const [confirm, setConfirm] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const save = useApiMutation("saveModel");

  // 1. Edit element state
  const [newName, setNewName] = useState(element.name);
  const [technology, setTechnology] = useState(element.technology ?? "");
  const [layer, setLayer] = useState<ArchitectureElement["layer"]>(element.layer ?? "unclassified");
  const [description, setDescription] = useState(element.description);

  // 2. Add element state
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<(typeof ELEMENT_TYPE_OPTIONS)[number]["value"]>("SERVICE_CONTAINER");
  const [addTech, setAddTech] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addParentId, setAddParentId] = useState("");

  // 3. Add connection state
  const [relFromId, setRelFromId] = useState(element.id);
  const [relToId, setRelToId] = useState(
    model.elements.find((e) => e.id !== element.id)?.id ?? element.id,
  );
  const [relType, setRelType] = useState<(typeof RELATION_TYPE_OPTIONS)[number]["value"]>("SERVICE_HTTP_CALL");

  // 4. Remove state
  const [removeTargetKind, setRemoveTargetKind] = useState<"element" | "connection">("element");
  const [removeEdgeId, setRemoveEdgeId] = useState(model.edges[0]?.id ?? "");

  const elementOptions = useMemo<ThreeESelectOption[]>(
    () =>
      model.elements.map((e) => ({
        value: e.id,
        label: e.name,
        badge: ELEMENT_TYPE_BADGE[e.elementType ?? ""] ?? e.elementType ?? "NODE",
        sublabel: [e.technology, e.description].filter(Boolean).join(" · ") || undefined,
      })),
    [model.elements],
  );

  const edgeOptions = useMemo<ThreeESelectOption[]>(() => {
    const nameOf = (id: string) => model.elements.find((n) => n.id === id)?.name ?? id;
    return model.edges.map((edge) => ({
      value: edge.id,
      label: `${nameOf(edge.from)} → ${nameOf(edge.to)}`,
      badge: edge.protocol,
      sublabel: edge.originLayer ? `Origin: ${edge.originLayer}` : undefined,
    }));
  }, [model.edges, model.elements]);

  const serviceContainers = useMemo(
    () => model.elements.filter((e) => e.elementType === "SERVICE_CONTAINER"),
    [model.elements],
  );

  const hasMetadataChange =
    newName.trim() !== element.name ||
    technology.trim() !== (element.technology ?? "") ||
    layer !== (element.layer ?? "unclassified");

  const editChanged =
    hasMetadataChange || description.trim() !== element.description.trim();

  const editValid =
    newName.trim().length > 0 &&
    newName.trim().length <= 255 &&
    description.length <= 2000 &&
    (hasMetadataChange || description.trim().length > 0);

  const addElementValid = addName.trim().length > 0 && addName.trim().length <= 255;
  const addConnectionValid = Boolean(relFromId && relToId && relFromId !== relToId);
  const removeValid =
    removeTargetKind === "element" ? Boolean(element.id) : Boolean(removeEdgeId);

  const dirty =
    mode === "edit-element"
      ? editChanged
      : mode === "add-element"
        ? addElementValid
        : mode === "add-connection"
          ? true
          : false;

  const canReview =
    isLatest &&
    !save.isPending &&
    (mode === "edit-element"
      ? editChanged && editValid
      : mode === "add-element"
        ? addElementValid
        : mode === "add-connection"
          ? addConnectionValid
          : removeValid);

  function updateEdit(patch: {
    name?: string;
    tech?: string;
    layer?: ArchitectureElement["layer"];
    desc?: string;
  }) {
    const nextName = patch.name ?? newName;
    const nextTech = patch.tech ?? technology;
    const nextLayer = patch.layer ?? layer;
    const nextDesc = patch.desc ?? description;
    if (patch.name !== undefined) setNewName(patch.name);
    if (patch.tech !== undefined) setTechnology(patch.tech);
    if (patch.layer !== undefined) setLayer(patch.layer);
    if (patch.desc !== undefined) setDescription(patch.desc);
    const changed =
      nextName.trim() !== element.name ||
      nextTech.trim() !== (element.technology ?? "") ||
      nextLayer !== (element.layer ?? "unclassified") ||
      nextDesc.trim() !== element.description.trim();
    onDirty(changed);
  }

  function resetDraft() {
    setNewName(element.name);
    setTechnology(element.technology ?? "");
    setLayer(element.layer ?? "unclassified");
    setDescription(element.description);
    setAddName("");
    setAddTech("");
    setAddDesc("");
    setRevisionNote("");
    onDirty(false);
  }

  async function commit() {
    try {
      const basePayload = {
        modelId: model.id,
        expectedRevision: model.revision,
        ...(revisionNote.trim() ? { revisionNote: revisionNote.trim() } : {}),
      };
      const request =
        mode === "edit-element"
          ? {
              ...basePayload,
              elementId: element.id,
              ...(description.trim() ? { description: description.trim() } : {}),
              ...(newName.trim() !== element.name ? { newName: newName.trim() } : {}),
              ...(technology.trim() !== (element.technology ?? "")
                ? { technology: technology.trim() }
                : {}),
              ...(layer !== (element.layer ?? "unclassified") ? { layer } : {}),
            }
          : mode === "add-element"
            ? {
                ...basePayload,
                addedElement: {
                  name: addName.trim(),
                  elementType: addType,
                  ...(addTech.trim() ? { technology: addTech.trim() } : {}),
                  ...(addDesc.trim() ? { description: addDesc.trim() } : {}),
                  ...(addType === "COMPONENT" && addParentId
                    ? { parentElementId: addParentId }
                    : {}),
                },
              }
            : mode === "add-connection"
              ? {
                  ...basePayload,
                  addedRelationship: {
                    sourceElementId: relFromId,
                    targetElementId: relToId,
                    relationType: relType,
                  },
                }
              : removeTargetKind === "element"
                ? {
                    ...basePayload,
                    removedElementId: element.id,
                  }
                : {
                    ...basePayload,
                    removedRelationshipId: removeEdgeId,
                  };

      const revision = await save.mutateAsync(request);
      setConfirm(false);
      onSaved(revision.id);
    } catch {
      /* Keep the draft and confirmation dialog open for recovery. */
    }
  }

  const nameOf = (id: string) => model.elements.find((n) => n.id === id)?.name ?? id;

  const changeSummaryText =
    mode === "edit-element"
      ? `Update element "${element.name}"${newName.trim() !== element.name ? ` → "${newName.trim()}"` : ""}: ${description.trim()}`
      : mode === "add-element"
        ? `Add ${addType} "${addName.trim()}"${addTech.trim() ? ` (${addTech.trim()})` : ""}`
        : mode === "add-connection"
          ? `Add ${relType} connection: ${nameOf(relFromId)} → ${nameOf(relToId)}`
          : removeTargetKind === "element"
            ? `Remove element "${element.name}" and its incident relationships`
            : `Remove relationship ${edgeOptions.find((e) => e.value === removeEdgeId)?.label ?? removeEdgeId}`;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <DetailPanel title={`Create Revision ${model.revision + 1}`}>
        <div className="space-y-4">
          {/* Mode selector tabs */}
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border bg-muted/40 p-1 sm:grid-cols-4">
            {(
              [
                { id: "edit-element", label: "Edit Element" },
                { id: "add-element", label: "+ Add Element" },
                { id: "add-connection", label: "+ Connection" },
                { id: "remove-item", label: "Remove" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  setMode(tab.id);
                  onDirty(false);
                }}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  mode === tab.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === "edit-element" && (
            <div className="space-y-3.5">
              <SearchableThreeESelect
                label="Element to edit"
                selectedValue={element.id}
                onSelect={(id) => {
                  onDirty(false);
                  onElement(id);
                }}
                options={elementOptions}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-medium">
                  <span>Element name</span>
                  <Input
                    value={newName}
                    maxLength={255}
                    disabled={!isLatest || save.isPending}
                    onChange={(e) => updateEdit({ name: e.target.value })}
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-medium">
                  <span>Technology stack</span>
                  <Input
                    value={technology}
                    maxLength={120}
                    placeholder="e.g. Spring Boot, MySQL, Kafka"
                    disabled={!isLatest || save.isPending}
                    onChange={(e) => updateEdit({ tech: e.target.value })}
                  />
                </label>
              </div>

              <SelectField
                label="Architecture layer"
                value={layer}
                disabled={!isLatest || save.isPending}
                onChange={(val) => updateEdit({ layer: val as ArchitectureElement["layer"] })}
                options={LAYER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />

              <FormField
                label="Responsibility / Description (optional)"
                error={
                  description.length > 2000
                    ? "Description must be 2000 characters or fewer."
                    : undefined
                }
              >
                {(props) => (
                  <Textarea
                    {...props}
                    value={description}
                    disabled={!isLatest || save.isPending}
                    maxLength={2000}
                    placeholder="Describe this element's architectural role or responsibility…"
                    onChange={(e) => updateEdit({ desc: e.target.value })}
                  />
                )}
              </FormField>
            </div>
          )}

          {mode === "add-element" && (
            <div className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-medium">
                  <span>New element name</span>
                  <Input
                    value={addName}
                    maxLength={255}
                    placeholder="e.g. ftgo-notification-service"
                    disabled={!isLatest || save.isPending}
                    onChange={(e) => {
                      setAddName(e.target.value);
                      onDirty(Boolean(e.target.value.trim()));
                    }}
                  />
                </label>
                <SelectField
                  label="Element type"
                  value={addType}
                  disabled={!isLatest || save.isPending}
                  onChange={(val) =>
                    setAddType(val as (typeof ELEMENT_TYPE_OPTIONS)[number]["value"])
                  }
                  options={ELEMENT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-medium">
                  <span>Technology stack (optional)</span>
                  <Input
                    value={addTech}
                    maxLength={120}
                    placeholder="e.g. Java / Spring Boot"
                    disabled={!isLatest || save.isPending}
                    onChange={(e) => setAddTech(e.target.value)}
                  />
                </label>
                {addType === "COMPONENT" && serviceContainers.length > 0 && (
                  <SelectField
                    label="Parent service container"
                    value={addParentId}
                    disabled={!isLatest || save.isPending}
                    onChange={setAddParentId}
                    options={[
                      { value: "", label: "None (top-level)" },
                      ...serviceContainers.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                )}
              </div>

              <label className="block space-y-1.5 text-xs font-medium">
                <span>Description (optional)</span>
                <Textarea
                  value={addDesc}
                  maxLength={2000}
                  placeholder="Describe the new element's responsibility…"
                  disabled={!isLatest || save.isPending}
                  onChange={(e) => setAddDesc(e.target.value)}
                />
              </label>
            </div>
          )}

          {mode === "add-connection" && (
            <div className="space-y-3.5">
              <SearchableThreeESelect
                label="Source element (Caller)"
                selectedValue={relFromId}
                onSelect={setRelFromId}
                options={elementOptions}
              />
              <SearchableThreeESelect
                label="Target element (Callee)"
                selectedValue={relToId}
                onSelect={setRelToId}
                options={elementOptions}
              />
              <SelectField
                label="Connection type"
                value={relType}
                disabled={!isLatest || save.isPending}
                onChange={(val) =>
                  setRelType(val as (typeof RELATION_TYPE_OPTIONS)[number]["value"])
                }
                options={RELATION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
              {relFromId === relToId && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  Source and target elements must be different.
                </p>
              )}
            </div>
          )}

          {mode === "remove-item" && (
            <div className="space-y-3.5">
              <SelectField
                label="Target type to remove"
                value={removeTargetKind}
                disabled={!isLatest || save.isPending}
                onChange={(v) => setRemoveTargetKind(v as "element" | "connection")}
                options={[
                  { value: "element", label: "Remove an Architecture Element" },
                  { value: "connection", label: "Remove a Connection (Relationship)" },
                ]}
              />
              {removeTargetKind === "element" ? (
                <SearchableThreeESelect
                  label="Element to remove"
                  selectedValue={element.id}
                  onSelect={onElement}
                  options={elementOptions}
                />
              ) : (
                <SearchableThreeESelect
                  label="Connection to remove"
                  selectedValue={removeEdgeId}
                  onSelect={setRemoveEdgeId}
                  options={edgeOptions}
                />
              )}
            </div>
          )}

          <div className="border-t pt-3">
            <label className="block space-y-1.5 text-xs font-medium">
              <span>Revision note (optional)</span>
              <Input
                value={revisionNote}
                maxLength={500}
                placeholder={`e.g. Document ${element.name} role for Revision ${model.revision + 1}`}
                disabled={!isLatest || save.isPending}
                onChange={(e) => setRevisionNote(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button disabled={!canReview} onClick={() => setConfirm(true)}>
              Review new revision
            </Button>
            {mode === "edit-element" && editChanged && (
              <Button variant="outline" disabled={save.isPending} onClick={resetDraft}>
                Discard draft
              </Button>
            )}
          </div>

          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={`Publish Revision ${model.revision + 1}?`}
            description={`Based on Revision ${model.revision}. Previous revisions and submitted coursework remain frozen.`}
            pending={save.isPending}
            onConfirm={() => {
              void commit();
            }}
            error={save.isError ? <ErrorState error={save.error} /> : undefined}
          >
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
              <p className="font-medium text-foreground">{changeSummaryText}</p>
              {revisionNote.trim() && (
                <p className="text-muted-foreground">Note: {revisionNote.trim()}</p>
              )}
            </div>
          </ConfirmDialog>
        </div>
      </DetailPanel>

      <ElementDetailsPanel model={model} selectedId={element.id} onSelect={onElement} />
    </div>
  );
}

export interface DiffFieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface DiffSideSnapshot {
  name: string;
  elementType: string;
  parentName: string;
  technology: string;
  layer: string;
  description: string;
  status: string;
}

export interface DiffRow {
  id: string;
  category: "element" | "relationship";
  status: "modified" | "added" | "removed" | "unchanged";
  scopeGroup: string;
  title: string;
  elementType: string;
  baseSide: DiffSideSnapshot | null;
  targetSide: DiffSideSnapshot | null;
  fieldDiffs: DiffFieldChange[];
}

export interface ReconciledModelDiff {
  baseRevision?: number | undefined;
  targetRevision?: number | undefined;
  addedElementsCount: number;
  modifiedElementsCount: number;
  removedElementsCount: number;
  unchangedElementsCount: number;
  addedRelationshipsCount: number;
  removedRelationshipsCount: number;
  unchangedRelationshipsCount: number;
  totalAdditions: number;
  totalModifications: number;
  totalDeletions: number;
  totalChanges: number;
  totalUnchanged: number;
  rows: DiffRow[];
}

function extractElementSide(
  el: Record<string, unknown>,
  idToName?: Map<string, string>,
): DiffSideSnapshot {
  const props =
    el["properties"] && typeof el["properties"] === "object"
      ? (el["properties"] as Record<string, unknown>)
      : {};
  const parentId = el["parentElementId"] ? String(el["parentElementId"]) : "";
  const parentName = String(
    el["parentElementName"] ?? (parentId && idToName?.get(parentId)) ?? "",
  ).trim();
  return {
    name: String(el["name"] ?? "").trim(),
    elementType: String(el["elementType"] ?? "SERVICE_CONTAINER").trim(),
    parentName,
    technology: String(el["languageStack"] ?? el["technology"] ?? "").trim(),
    layer: String(props["layer"] ?? el["layer"] ?? "").trim(),
    description: String(props["description"] ?? el["description"] ?? "").trim(),
    status: String(el["status"] ?? "").trim(),
  };
}

function elementSemanticKey(
  el: Record<string, unknown>,
  idToName?: Map<string, string>,
): string {
  const side = extractElementSide(el, idToName);
  const props =
    el["properties"] && typeof el["properties"] === "object"
      ? (el["properties"] as Record<string, unknown>)
      : {};
  const fqn = String(props["fqn"] ?? props["qualifiedName"] ?? "").trim();
  return `${side.elementType}::${side.parentName}::${fqn || side.name}`;
}

function computeElementFieldDiffs(
  baseSide: DiffSideSnapshot,
  targetSide: DiffSideSnapshot,
): DiffFieldChange[] {
  const diffs: DiffFieldChange[] = [];
  const checks: Array<[keyof DiffSideSnapshot, string]> = [
    ["name", "Name"],
    ["elementType", "Type"],
    ["parentName", "Parent container"],
    ["technology", "Technology"],
    ["layer", "Layer"],
    ["description", "Description"],
  ];
  for (const [key, label] of checks) {
    const bVal = baseSide[key] || "";
    const tVal = targetSide[key] || "";
    if (bVal !== tVal) {
      diffs.push({ field: key, label, before: bVal, after: tVal });
    }
  }
  if (
    baseSide.status !== targetSide.status &&
    (baseSide.status === "STUDENT_CONFIRMED" || targetSide.status === "STUDENT_CONFIRMED")
  ) {
    diffs.push({
      field: "status",
      label: "Confirmation",
      before: baseSide.status || "DEFAULT",
      after: targetSide.status || "DEFAULT",
    });
  }
  return diffs;
}

export function reconcileModelDiff(result: Record<string, unknown>): ReconciledModelDiff {
  const rawAddedEls = (Array.isArray(result["addedElements"]) ? result["addedElements"] : [])
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  const rawRemovedEls = (Array.isArray(result["removedElements"]) ? result["removedElements"] : [])
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  const rawModifiedEls = (
    Array.isArray(result["modifiedElements"]) ? result["modifiedElements"] : []
  ).filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  const rawUnchangedEls = (
    Array.isArray(result["unchangedElements"]) ? result["unchangedElements"] : []
  ).filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));

  const rawAddedRels = (
    Array.isArray(result["addedRelationships"]) ? result["addedRelationships"] : []
  ).filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  const rawRemovedRels = (
    Array.isArray(result["removedRelationships"]) ? result["removedRelationships"] : []
  ).filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  const rawUnchangedRels = (
    Array.isArray(result["unchangedRelationships"]) ? result["unchangedRelationships"] : []
  ).filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));

  const baseIdToName = new Map<string, string>();
  const targetIdToName = new Map<string, string>();

  for (const el of [...rawRemovedEls, ...rawUnchangedEls]) {
    if (el["id"] && el["name"]) baseIdToName.set(String(el["id"]), String(el["name"]));
  }
  for (const el of [...rawAddedEls, ...rawUnchangedEls]) {
    if (el["id"] && el["name"]) targetIdToName.set(String(el["id"]), String(el["name"]));
  }
  for (const mod of rawModifiedEls) {
    const b = mod["baseElement"] as Record<string, unknown> | undefined;
    const t = mod["targetElement"] as Record<string, unknown> | undefined;
    if (b?.["id"] && b?.["name"]) baseIdToName.set(String(b["id"]), String(b["name"]));
    if (t?.["id"] && t?.["name"]) targetIdToName.set(String(t["id"]), String(t["name"]));
  }

  // Pair removed & added elements that share the same semantic identity (fixes false-positive full diffs across snapshot runs)
  const unmatchedRemovedIdx = new Set<number>(rawRemovedEls.map((_, i) => i));
  const unmatchedAddedIdx = new Set<number>(rawAddedEls.map((_, i) => i));

  const addedByKey = new Map<string, number[]>();
  rawAddedEls.forEach((el, idx) => {
    const k = elementSemanticKey(el, targetIdToName);
    const list = addedByKey.get(k) ?? [];
    list.push(idx);
    addedByKey.set(k, list);
  });

  const rows: DiffRow[] = [];
  let modifiedElementsCount = 0;
  let unchangedElementsCount = rawUnchangedEls.length;

  // Process backend-reported modified elements first
  rawModifiedEls.forEach((mod, idx) => {
    const bRaw = (mod["baseElement"] ?? {}) as Record<string, unknown>;
    const tRaw = (mod["targetElement"] ?? {}) as Record<string, unknown>;
    const baseSide = extractElementSide(bRaw, baseIdToName);
    const targetSide = extractElementSide(tRaw, targetIdToName);
    const fieldDiffs = computeElementFieldDiffs(baseSide, targetSide);
    if (fieldDiffs.length === 0) {
      unchangedElementsCount++;
      rows.push({
        id: `el-unchanged-mod-${idx}`,
        category: "element",
        status: "unchanged",
        scopeGroup: targetSide.parentName || targetSide.name || "Architecture Elements",
        title: targetSide.name,
        elementType: targetSide.elementType,
        baseSide,
        targetSide,
        fieldDiffs: [],
      });
    } else {
      modifiedElementsCount++;
      rows.push({
        id: `el-mod-${idx}`,
        category: "element",
        status: "modified",
        scopeGroup: targetSide.parentName || baseSide.parentName || targetSide.name,
        title: targetSide.name || baseSide.name,
        elementType: targetSide.elementType || baseSide.elementType,
        baseSide,
        targetSide,
        fieldDiffs,
      });
    }
  });

  // Match removed vs added by semantic key
  rawRemovedEls.forEach((remEl, rIdx) => {
    const k = elementSemanticKey(remEl, baseIdToName);
    const candidates = addedByKey.get(k);
    const matchIdx = candidates?.find((aIdx) => unmatchedAddedIdx.has(aIdx));
    if (matchIdx !== undefined) {
      unmatchedRemovedIdx.delete(rIdx);
      unmatchedAddedIdx.delete(matchIdx);
      const addEl = rawAddedEls[matchIdx]!;
      const baseSide = extractElementSide(remEl, baseIdToName);
      const targetSide = extractElementSide(addEl, targetIdToName);
      const fieldDiffs = computeElementFieldDiffs(baseSide, targetSide);
      if (fieldDiffs.length === 0) {
        unchangedElementsCount++;
        rows.push({
          id: `el-paired-unchanged-${rIdx}`,
          category: "element",
          status: "unchanged",
          scopeGroup: targetSide.parentName || targetSide.name || "Architecture Elements",
          title: targetSide.name,
          elementType: targetSide.elementType,
          baseSide,
          targetSide,
          fieldDiffs: [],
        });
      } else {
        modifiedElementsCount++;
        rows.push({
          id: `el-paired-mod-${rIdx}`,
          category: "element",
          status: "modified",
          scopeGroup: targetSide.parentName || baseSide.parentName || targetSide.name,
          title: targetSide.name || baseSide.name,
          elementType: targetSide.elementType,
          baseSide,
          targetSide,
          fieldDiffs,
        });
      }
    }
  });

  // Remaining unmatched added elements
  let addedElementsCount = 0;
  rawAddedEls.forEach((addEl, aIdx) => {
    if (!unmatchedAddedIdx.has(aIdx)) return;
    addedElementsCount++;
    const targetSide = extractElementSide(addEl, targetIdToName);
    rows.push({
      id: `el-add-${aIdx}`,
      category: "element",
      status: "added",
      scopeGroup: targetSide.parentName || targetSide.name || "Architecture Elements",
      title: targetSide.name,
      elementType: targetSide.elementType,
      baseSide: null,
      targetSide,
      fieldDiffs: [],
    });
  });

  // Remaining unmatched removed elements
  let removedElementsCount = 0;
  rawRemovedEls.forEach((remEl, rIdx) => {
    if (!unmatchedRemovedIdx.has(rIdx)) return;
    removedElementsCount++;
    const baseSide = extractElementSide(remEl, baseIdToName);
    rows.push({
      id: `el-rem-${rIdx}`,
      category: "element",
      status: "removed",
      scopeGroup: baseSide.parentName || baseSide.name || "Architecture Elements",
      title: baseSide.name,
      elementType: baseSide.elementType,
      baseSide,
      targetSide: null,
      fieldDiffs: [],
    });
  });

  // Include backend-reported unchanged elements
  rawUnchangedEls.forEach((uncEl, uIdx) => {
    const side = extractElementSide(uncEl, targetIdToName);
    rows.push({
      id: `el-unc-${uIdx}`,
      category: "element",
      status: "unchanged",
      scopeGroup: side.parentName || side.name || "Architecture Elements",
      title: side.name,
      elementType: side.elementType,
      baseSide: side,
      targetSide: side,
      fieldDiffs: [],
    });
  });

  // Reconcile relationships by semantic endpoints & protocol
  const formatRelSide = (
    rel: Record<string, unknown>,
    idMap: Map<string, string>,
  ): DiffSideSnapshot => {
    const srcId = rel["sourceElementId"] ? String(rel["sourceElementId"]) : "";
    const tgtId = rel["targetElementId"] ? String(rel["targetElementId"]) : "";
    const srcName = String(rel["sourceElementName"] ?? idMap.get(srcId) ?? srcId).trim();
    const tgtName = String(rel["targetElementName"] ?? idMap.get(tgtId) ?? tgtId).trim();
    const relType = String(rel["relationType"] ?? rel["protocol"] ?? "DEPENDENCY").trim();
    const origin = String(rel["originLayer"] ?? "STATIC").trim();
    return {
      name: `${srcName} → ${tgtName}`,
      elementType: relType,
      parentName: srcName,
      technology: origin,
      layer: String(rel["direction"] ?? "DIRECTED"),
      description: "",
      status: "",
    };
  };

  const unmatchedRemRels = new Set<number>(rawRemovedRels.map((_, i) => i));
  const unmatchedAddRels = new Set<number>(rawAddedRels.map((_, i) => i));
  const addRelsByKey = new Map<string, number[]>();

  rawAddedRels.forEach((rel, idx) => {
    const side = formatRelSide(rel, targetIdToName);
    const key = `${side.name}::${side.elementType}`;
    const list = addRelsByKey.get(key) ?? [];
    list.push(idx);
    addRelsByKey.set(key, list);
  });

  let unchangedRelationshipsCount = rawUnchangedRels.length;
  rawRemovedRels.forEach((remRel, rIdx) => {
    const baseSide = formatRelSide(remRel, baseIdToName);
    const key = `${baseSide.name}::${baseSide.elementType}`;
    const candidates = addRelsByKey.get(key);
    const matchIdx = candidates?.find((aIdx) => unmatchedAddRels.has(aIdx));
    if (matchIdx !== undefined) {
      unmatchedRemRels.delete(rIdx);
      unmatchedAddRels.delete(matchIdx);
      unchangedRelationshipsCount++;
      const targetSide = formatRelSide(rawAddedRels[matchIdx]!, targetIdToName);
      rows.push({
        id: `rel-paired-unc-${rIdx}`,
        category: "relationship",
        status: "unchanged",
        scopeGroup: "Architecture Connections",
        title: targetSide.name,
        elementType: targetSide.elementType,
        baseSide,
        targetSide,
        fieldDiffs: [],
      });
    }
  });

  let addedRelationshipsCount = 0;
  rawAddedRels.forEach((addRel, aIdx) => {
    if (!unmatchedAddRels.has(aIdx)) return;
    addedRelationshipsCount++;
    const targetSide = formatRelSide(addRel, targetIdToName);
    rows.push({
      id: `rel-add-${aIdx}`,
      category: "relationship",
      status: "added",
      scopeGroup: "Architecture Connections",
      title: targetSide.name,
      elementType: targetSide.elementType,
      baseSide: null,
      targetSide,
      fieldDiffs: [],
    });
  });

  let removedRelationshipsCount = 0;
  rawRemovedRels.forEach((remRel, rIdx) => {
    if (!unmatchedRemRels.has(rIdx)) return;
    removedRelationshipsCount++;
    const baseSide = formatRelSide(remRel, baseIdToName);
    rows.push({
      id: `rel-rem-${rIdx}`,
      category: "relationship",
      status: "removed",
      scopeGroup: "Architecture Connections",
      title: baseSide.name,
      elementType: baseSide.elementType,
      baseSide,
      targetSide: null,
      fieldDiffs: [],
    });
  });

  rawUnchangedRels.forEach((uncRel, uIdx) => {
    const side = formatRelSide(uncRel, targetIdToName);
    rows.push({
      id: `rel-unc-${uIdx}`,
      category: "relationship",
      status: "unchanged",
      scopeGroup: "Architecture Connections",
      title: side.name,
      elementType: side.elementType,
      baseSide: side,
      targetSide: side,
      fieldDiffs: [],
    });
  });

  // Sort rows: modified -> added -> removed -> unchanged, then by title
  const statusOrder: Record<DiffRow["status"], number> = {
    modified: 0,
    added: 1,
    removed: 2,
    unchanged: 3,
  };
  rows.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    if (a.category !== b.category) {
      return a.category === "element" ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  const totalAdditions = addedElementsCount + addedRelationshipsCount;
  const totalModifications = modifiedElementsCount;
  const totalDeletions = removedElementsCount + removedRelationshipsCount;
  const totalChanges = totalAdditions + totalModifications + totalDeletions;
  const totalUnchanged = unchangedElementsCount + unchangedRelationshipsCount;

  return {
    baseRevision:
      typeof result["baseRevision"] === "number" ? result["baseRevision"] : undefined,
    targetRevision:
      typeof result["targetRevision"] === "number" ? result["targetRevision"] : undefined,
    addedElementsCount,
    modifiedElementsCount,
    removedElementsCount,
    unchangedElementsCount,
    addedRelationshipsCount,
    removedRelationshipsCount,
    unchangedRelationshipsCount,
    totalAdditions,
    totalModifications,
    totalDeletions,
    totalChanges,
    totalUnchanged,
    rows,
  };
}

export function buildModelDiffResultFromModels(
  before: ArchitecturalModel,
  after: ArchitecturalModel,
): Record<string, unknown> {
  const beforeParents = new Map(before.elements.map((e) => [e.id, e.name]));
  const afterParents = new Map(after.elements.map((e) => [e.id, e.name]));
  return {
    baseRevision: before.revision,
    targetRevision: after.revision,
    removedElements: before.elements.map((e) => ({
      id: e.id,
      name: e.name,
      elementType: e.elementType ?? "SERVICE_CONTAINER",
      languageStack: e.technology ?? "",
      parentElementId: e.parentId ?? null,
      parentElementName: e.parentId ? beforeParents.get(e.parentId) ?? "" : "",
      properties: { ...e.properties, layer: e.layer, description: e.description },
    })),
    addedElements: after.elements.map((e) => ({
      id: e.id,
      name: e.name,
      elementType: e.elementType ?? "SERVICE_CONTAINER",
      languageStack: e.technology ?? "",
      parentElementId: e.parentId ?? null,
      parentElementName: e.parentId ? afterParents.get(e.parentId) ?? "" : "",
      properties: { ...e.properties, layer: e.layer, description: e.description },
    })),
    removedRelationships: before.edges.map((r) => ({
      id: r.id,
      sourceElementId: r.from,
      sourceElementName: beforeParents.get(r.from) ?? r.from,
      targetElementId: r.to,
      targetElementName: beforeParents.get(r.to) ?? r.to,
      relationType: r.protocol,
      originLayer: r.originLayer ?? "STATIC",
      direction: "DIRECTED",
    })),
    addedRelationships: after.edges.map((r) => ({
      id: r.id,
      sourceElementId: r.from,
      sourceElementName: afterParents.get(r.from) ?? r.from,
      targetElementId: r.to,
      targetElementName: afterParents.get(r.to) ?? r.to,
      relationType: r.protocol,
      originLayer: r.originLayer ?? "STATIC",
      direction: "DIRECTED",
    })),
  };
}

export function CompareModels() {
  const api = useApi();
  return api.mode === "backend" ? <BackendCompare /> : <MockCompare />;
}

function MockCompare() {
  const state = useModel();
  const [beforeId, setBefore] = useState("");
  const [afterId, setAfter] = useState("");
  const models = state.models as ArchitecturalModel[];
  const before = models.find((m) => m.id === beforeId) ?? models[1] ?? models[0];
  const after = models.find((m) => m.id === afterId) ?? models[0];
  return state.projectId ? (
    <RequestState
      query={state.query}
      empty={state.models.length < 2}
      emptyMessage="Analyze another source or save a new revision to compare versions."
    >
      {before && after && (
        <div className="space-y-4">
          <RevisionCompareBar
            models={state.models}
            baseId={before.id}
            targetId={after.id}
            onBaseChange={setBefore}
            onTargetChange={setAfter}
            onSwap={() => {
              setBefore(after.id);
              setAfter(before.id);
            }}
          />
          <ComparisonResult
            result={buildModelDiffResultFromModels(before, after)}
            baseLabel={`Revision ${before.revision}`}
            targetLabel={`Revision ${after.revision}`}
          />
        </div>
      )}
    </RequestState>
  ) : null;
}

function BackendCompare() {
  const state = useModel();
  const [base, setBase] = useState("");
  const [target, setTarget] = useState("");
  const first = base || state.models[1]?.id || state.models[0]?.id || "";
  const second = target || state.models[0]?.id || "";
  const baseModel = state.models.find((m) => m.id === first);
  const targetModel = state.models.find((m) => m.id === second);
  const comparison = useApiQuery(
    "compareModels",
    { baseModelId: first, targetModelId: second },
    { enabled: !!first && !!second },
  );
  return (
    <RequestState
      query={state.query}
      empty={state.models.length < 2}
      emptyMessage="Create another model revision to compare."
    >
      <div className="space-y-4">
        <RevisionCompareBar
          models={state.models}
          baseId={first}
          targetId={second}
          onBaseChange={setBase}
          onTargetChange={setTarget}
          onSwap={() => {
            setBase(second);
            setTarget(first);
          }}
        />
        {first && second && (
          <RequestState query={comparison}>
            {comparison.data && (
              <ComparisonResult
                result={comparison.data.result}
                baseLabel={baseModel ? `Revision ${baseModel.revision}` : "Base Revision"}
                targetLabel={targetModel ? `Revision ${targetModel.revision}` : "Target Revision"}
              />
            )}
          </RequestState>
        )}
      </div>
    </RequestState>
  );
}

function RevisionCompareBar({
  models,
  baseId,
  targetId,
  onBaseChange,
  onTargetChange,
  onSwap,
}: {
  models: Parameters<typeof ModelVersionSelector>[0]["models"];
  baseId: string;
  targetId: string;
  onBaseChange: (id: string) => void;
  onTargetChange: (id: string) => void;
  onSwap: () => void;
}) {
  return (
    <div className="grid items-end gap-3 rounded-xl border bg-card p-3.5 md:grid-cols-[1fr_auto_1fr]">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-700 dark:text-red-300">
            − BASE (BEFORE)
          </span>
        </div>
        <ModelVersionSelector models={models} value={baseId} onChange={onBaseChange} />
      </div>
      <div className="flex justify-center pb-0.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSwap}
          title="Swap Base and Target revisions"
          className="font-mono text-xs"
        >
          ⇄ Swap
        </Button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            + TARGET (AFTER)
          </span>
        </div>
        <ModelVersionSelector models={models} value={targetId} onChange={onTargetChange} />
      </div>
    </div>
  );
}

type DiffFilterMode = "all-changes" | "added" | "modified" | "removed" | "connections" | "unchanged";
type DiffViewLayout = "split" | "unified";

function ComparisonResult({
  result,
  baseLabel,
  targetLabel,
}: {
  result: Record<string, unknown>;
  baseLabel?: string;
  targetLabel?: string;
}) {
  const diff = useMemo(() => reconcileModelDiff(result), [result]);
  const [viewLayout, setViewLayout] = useState<DiffViewLayout>("split");
  const [filterMode, setFilterMode] = useState<DiffFilterMode>("all-changes");
  const [searchQuery, setSearchQuery] = useState("");

  const resolvedBaseLabel =
    baseLabel ?? (diff.baseRevision ? `Revision ${diff.baseRevision}` : "Base Revision");
  const resolvedTargetLabel =
    targetLabel ?? (diff.targetRevision ? `Revision ${diff.targetRevision}` : "Target Revision");

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return diff.rows.filter((row) => {
      if (filterMode === "all-changes" && row.status === "unchanged") return false;
      if (filterMode === "added" && row.status !== "added") return false;
      if (filterMode === "modified" && row.status !== "modified") return false;
      if (filterMode === "removed" && row.status !== "removed") return false;
      if (filterMode === "connections" && (row.category !== "relationship" || row.status === "unchanged"))
        return false;
      if (filterMode === "unchanged" && row.status !== "unchanged") return false;

      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.elementType.toLowerCase().includes(q) ||
        row.scopeGroup.toLowerCase().includes(q) ||
        (row.baseSide?.description ?? "").toLowerCase().includes(q) ||
        (row.targetSide?.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [diff.rows, filterMode, searchQuery]);

  const connectionChangeCount = diff.addedRelationshipsCount + diff.removedRelationshipsCount;

  return (
    <div className="space-y-4">
      {/* GitHub Commit Diff Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-foreground">
            Showing <span className="font-mono">{diff.totalChanges}</span> changed item
            {diff.totalChanges === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono font-semibold text-emerald-700 dark:text-emerald-300">
            +{diff.totalAdditions} added
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 font-mono font-semibold text-amber-700 dark:text-amber-300">
            ~{diff.totalModifications} modified
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 font-mono font-semibold text-red-700 dark:text-red-300">
            −{diff.totalDeletions} removed
          </span>
          <span className="text-muted-foreground">
            ({diff.totalUnchanged} unchanged)
          </span>
        </div>

        {/* Split vs Unified Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewLayout("split")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                viewLayout === "split"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Split (Side-by-Side)
            </button>
            <button
              type="button"
              onClick={() => setViewLayout("unified")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                viewLayout === "unified"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Unified (+ / −)
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs + Quick Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all-changes", label: `All Changes (${diff.totalChanges})` },
              { id: "modified", label: `~ Modified (${diff.modifiedElementsCount})` },
              { id: "added", label: `+ Added (${diff.totalAdditions})` },
              { id: "removed", label: `− Removed (${diff.totalDeletions})` },
              { id: "connections", label: `Connections (${connectionChangeCount})` },
              { id: "unchanged", label: `Unchanged (${diff.totalUnchanged})` },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={filterMode === tab.id ? "default" : "outline"}
              onClick={() => setFilterMode(tab.id)}
              className="h-8 font-mono text-xs"
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name, type, service..."
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Diff Viewer Body */}
      {filteredRows.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center">
          {diff.totalChanges === 0 && filterMode !== "unchanged" ? (
            <div className="space-y-2.5">
              <p className="text-sm font-semibold text-foreground">
                No differences between {resolvedBaseLabel} and {resolvedTargetLabel} (+0 / ~0 / −0)
              </p>
              <p className="text-xs text-muted-foreground">
                All {diff.unchangedElementsCount} architecture elements and{" "}
                {diff.unchangedRelationshipsCount} connections are structurally and semantically identical.
              </p>
              {diff.totalUnchanged > 0 && (
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFilterMode("unchanged")}
                  >
                    Compare all {diff.totalUnchanged} unchanged items side-by-side
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No diff items match the current filter.
            </p>
          )}
        </div>
      ) : viewLayout === "split" ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {/* Sticky Side-by-Side Column Headers */}
          <div className="grid grid-cols-2 divide-x border-b bg-muted/50 text-xs font-semibold">
            <div className="flex items-center justify-between px-3.5 py-2.5 text-red-700 dark:text-red-300">
              <span className="font-mono">− {resolvedBaseLabel}</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                −{diff.totalDeletions} removed · ~{diff.totalModifications} modified
              </span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5 text-emerald-700 dark:text-emerald-300">
              <span className="font-mono">+ {resolvedTargetLabel}</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                +{diff.totalAdditions} added · ~{diff.totalModifications} modified
              </span>
            </div>
          </div>

          {/* Side-by-Side Diff Rows */}
          <div className="max-h-[680px] divide-y overflow-y-auto font-mono text-xs">
            {filteredRows.map((row) => (
              <SplitDiffRowView key={row.id} row={row} />
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/50 px-3.5 py-2.5 font-mono text-xs font-semibold">
            <span>
              Unified Diff: {resolvedBaseLabel} → {resolvedTargetLabel}
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {filteredRows.length} item{filteredRows.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="max-h-[680px] divide-y overflow-y-auto font-mono text-xs">
            {filteredRows.map((row) => (
              <UnifiedDiffRowView key={row.id} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SplitDiffRowView({ row }: { row: DiffRow }) {
  if (row.status === "modified" && row.baseSide && row.targetSide) {
    return (
      <div className="grid grid-cols-2 divide-x">
        {/* Left (Base - Old values in red) */}
        <div className="space-y-1.5 bg-red-500/[0.04] p-3 border-l-4 border-l-amber-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-red-500/20 font-bold text-red-700 dark:text-red-300">
              −
            </span>
            <Badge variant="outline" className="text-[10px]">
              {row.baseSide.elementType}
            </Badge>
            <span className="font-semibold text-foreground">{row.baseSide.name}</span>
            {row.baseSide.parentName && (
              <span className="text-[11px] text-muted-foreground">
                in {row.baseSide.parentName}
              </span>
            )}
          </div>
          <div className="space-y-1 pl-5">
            {row.fieldDiffs.map((fd) => (
              <div
                key={fd.field}
                className="rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-800 dark:text-red-200"
              >
                <span className="font-semibold">− {fd.label}:</span>{" "}
                <span className="break-words">{fd.before || "(empty)"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right (Target - New values in green) */}
        <div className="space-y-1.5 bg-emerald-500/[0.04] p-3 border-l-4 border-l-emerald-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500/20 font-bold text-emerald-700 dark:text-emerald-300">
              +
            </span>
            <Badge variant="outline" className="text-[10px]">
              {row.targetSide.elementType}
            </Badge>
            <span className="font-semibold text-foreground">{row.targetSide.name}</span>
            {row.targetSide.parentName && (
              <span className="text-[11px] text-muted-foreground">
                in {row.targetSide.parentName}
              </span>
            )}
          </div>
          <div className="space-y-1 pl-5">
            {row.fieldDiffs.map((fd) => (
              <div
                key={fd.field}
                className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-200"
              >
                <span className="font-semibold">+ {fd.label}:</span>{" "}
                <span className="break-words">{fd.after || "(empty)"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (row.status === "removed" && row.baseSide) {
    return (
      <div className="grid grid-cols-2 divide-x">
        <div className="space-y-1 bg-red-500/10 p-3 border-l-4 border-l-red-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-red-500/25 font-bold text-red-700 dark:text-red-300">
              −
            </span>
            <Badge variant="outline" className="text-[10px]">
              {row.baseSide.elementType}
            </Badge>
            <span className="font-semibold text-red-900 dark:text-red-200">
              {row.baseSide.name}
            </span>
            {row.baseSide.parentName && row.category === "element" && (
              <span className="text-[11px] text-muted-foreground">
                in {row.baseSide.parentName}
              </span>
            )}
            {row.baseSide.technology && (
              <span className="text-[11px] text-muted-foreground">
                [{row.baseSide.technology}]
              </span>
            )}
          </div>
          {row.baseSide.description && (
            <p className="pl-5 font-sans text-[11px] text-muted-foreground">
              {row.baseSide.description}
            </p>
          )}
        </div>
        <div className="flex items-center justify-center bg-muted/20 p-3 text-[11px] italic text-muted-foreground/50">
          — Removed in Target —
        </div>
      </div>
    );
  }

  if (row.status === "added" && row.targetSide) {
    return (
      <div className="grid grid-cols-2 divide-x">
        <div className="flex items-center justify-center bg-muted/20 p-3 text-[11px] italic text-muted-foreground/50">
          — Not in Base —
        </div>
        <div className="space-y-1 bg-emerald-500/10 p-3 border-l-4 border-l-emerald-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500/25 font-bold text-emerald-700 dark:text-emerald-300">
              +
            </span>
            <Badge variant="outline" className="text-[10px]">
              {row.targetSide.elementType}
            </Badge>
            <span className="font-semibold text-emerald-900 dark:text-emerald-200">
              {row.targetSide.name}
            </span>
            {row.targetSide.parentName && row.category === "element" && (
              <span className="text-[11px] text-muted-foreground">
                in {row.targetSide.parentName}
              </span>
            )}
            {row.targetSide.technology && (
              <span className="text-[11px] text-muted-foreground">
                [{row.targetSide.technology}]
              </span>
            )}
          </div>
          {row.targetSide.description && (
            <p className="pl-5 font-sans text-[11px] text-muted-foreground">
              {row.targetSide.description}
            </p>
          )}
        </div>
      </div>
    );
  }

  const side = row.targetSide ?? row.baseSide;
  if (!side) return null;
  return (
    <div className="grid grid-cols-2 divide-x">
      <div className="flex flex-wrap items-center gap-1.5 p-2.5 text-muted-foreground">
        <span className="inline-flex h-4 w-4 items-center justify-center text-[10px]">=</span>
        <Badge variant="outline" className="text-[10px]">
          {side.elementType}
        </Badge>
        <span className="font-medium text-foreground">{side.name}</span>
        {side.parentName && row.category === "element" && (
          <span className="text-[11px]">in {side.parentName}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 p-2.5 text-muted-foreground">
        <span className="inline-flex h-4 w-4 items-center justify-center text-[10px]">=</span>
        <Badge variant="outline" className="text-[10px]">
          {side.elementType}
        </Badge>
        <span className="font-medium text-foreground">{side.name}</span>
        {side.parentName && row.category === "element" && (
          <span className="text-[11px]">in {side.parentName}</span>
        )}
      </div>
    </div>
  );
}

function UnifiedDiffRowView({ row }: { row: DiffRow }) {
  if (row.status === "modified" && row.baseSide && row.targetSide) {
    return (
      <div className="space-y-1 p-3">
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Badge variant="warning">~ Modified</Badge>
          <Badge variant="outline" className="text-[10px]">
            {row.targetSide.elementType}
          </Badge>
          <span className="font-semibold">{row.title}</span>
          {row.targetSide.parentName && (
            <span className="text-[11px] text-muted-foreground">
              in {row.targetSide.parentName}
            </span>
          )}
        </div>
        {row.fieldDiffs.map((fd) => (
          <div key={fd.field} className="space-y-0.5 pl-2">
            <div className="rounded bg-red-500/15 px-2.5 py-1 text-[11px] text-red-800 dark:text-red-200">
              <span className="font-semibold">− {fd.label}:</span> {fd.before || "(empty)"}
            </div>
            <div className="rounded bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-800 dark:text-emerald-200">
              <span className="font-semibold">+ {fd.label}:</span> {fd.after || "(empty)"}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (row.status === "removed" && row.baseSide) {
    return (
      <div className="bg-red-500/10 px-3.5 py-2.5 border-l-4 border-l-red-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-red-700 dark:text-red-300">−</span>
          <Badge variant="outline" className="text-[10px]">
            {row.baseSide.elementType}
          </Badge>
          <span className="font-semibold text-red-900 dark:text-red-200">
            {row.baseSide.name}
          </span>
          {row.baseSide.parentName && row.category === "element" && (
            <span className="text-[11px] text-muted-foreground">
              in {row.baseSide.parentName}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (row.status === "added" && row.targetSide) {
    return (
      <div className="bg-emerald-500/10 px-3.5 py-2.5 border-l-4 border-l-emerald-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-emerald-700 dark:text-emerald-300">+</span>
          <Badge variant="outline" className="text-[10px]">
            {row.targetSide.elementType}
          </Badge>
          <span className="font-semibold text-emerald-900 dark:text-emerald-200">
            {row.targetSide.name}
          </span>
          {row.targetSide.parentName && row.category === "element" && (
            <span className="text-[11px] text-muted-foreground">
              in {row.targetSide.parentName}
            </span>
          )}
        </div>
      </div>
    );
  }

  const side = row.targetSide ?? row.baseSide;
  if (!side) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 text-muted-foreground">
      <span>=</span>
      <Badge variant="outline" className="text-[10px]">
        {side.elementType}
      </Badge>
      <span className="text-foreground">{side.name}</span>
    </div>
  );
}


