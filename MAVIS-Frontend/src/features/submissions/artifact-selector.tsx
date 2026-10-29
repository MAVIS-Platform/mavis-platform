"use client";
import { useState, useRef, useEffect } from "react";
import { useApiQuery } from "@/hooks/use-api";
import {
  COURSEWORK_DIAGRAM_TYPES,
  diagramTypeLabel,
  projectionDiagramType,
} from "@/lib/architecture/coursework-diagram-types";
import { RequestState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";

export type ArtifactSelection = {
  documents: Array<{ viewId: string; revision: number }>;
  diagramVersionIds: string[];
};

export function ArtifactSelector({
  modelId,
  onChange,
}: {
  modelId: string;
  onChange: (value: ArtifactSelection) => void;
}) {
  const documents = useApiQuery("documentRevisions", { modelId }),
    generated = useApiQuery("diagrams", { modelId });
  const [selected, setSelected] = useState<ArtifactSelection>({
    documents: [],
    diagramVersionIds: [],
  });
  const initializedModelRef = useRef<string | null>(null);

  function change(next: ArtifactSelection) {
    setSelected(next);
    onChange(next);
  }

  const views = [...new Set((documents.data ?? []).map((d) => d.viewId))];

  const compatibleGenerated = (generated.data ?? []).filter((d) =>
    COURSEWORK_DIAGRAM_TYPES.some(
      (type) => type.id === projectionDiagramType(d.notation, d.level),
    ),
  );

  useEffect(() => {
    if (initializedModelRef.current === modelId) return;
    if (!documents.data || !generated.data) return;

    const uniqueViews = [...new Set(documents.data.map((d) => d.viewId))];
    const defaultDocs = uniqueViews.map((view) => {
      const versions = documents.data!.filter((d) => d.viewId === view);
      return { viewId: view, revision: versions[0]!.revision };
    });
    const defaultGenerated = generated.data
      .filter((d) =>
        COURSEWORK_DIAGRAM_TYPES.some(
          (type) => type.id === projectionDiagramType(d.notation, d.level),
        ),
      )
      .map((d) => d.id);

    const autoSelected: ArtifactSelection = {
      documents: defaultDocs,
      diagramVersionIds: defaultGenerated,
    };

    initializedModelRef.current = modelId;
    setSelected(autoSelected);
    onChange(autoSelected);
  }, [modelId, documents.data, generated.data, onChange]);

  const selectAll = () => {
    const allDocs = views.map((view) => {
      const versions = (documents.data ?? []).filter((d) => d.viewId === view);
      return { viewId: view, revision: versions[0]?.revision ?? 1 };
    });
    const allGen = compatibleGenerated.map((d) => d.id);
    change({ documents: allDocs, diagramVersionIds: allGen });
  };

  const clearAll = () => {
    change({ documents: [], diagramVersionIds: [] });
  };

  const hasSelections = selected.documents.length > 0 || selected.diagramVersionIds.length > 0;

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Diagram versions to submit</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={hasSelections ? clearAll : selectAll}
        >
          {hasSelections ? "Clear selection" : "Select all available diagrams"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Save your diagrams first. Choose an exact saved revision for each view; the selected content
        is frozen into the submission bundle.
      </p>
      <RequestState query={documents}>
        {views.map((view) => {
          const versions = documents.data!.filter((d) => d.viewId === view),
            current = selected.documents.find((d) => d.viewId === view);
          return (
            <div key={view} className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!current}
                  onChange={(e) =>
                    change({
                      ...selected,
                      documents: e.target.checked
                        ? [...selected.documents, { viewId: view, revision: versions[0]!.revision }]
                        : selected.documents.filter((d) => d.viewId !== view),
                    })
                  }
                />
                <span className="break-all">{view}</span>
              </label>
              <select
                aria-label={`Revision for ${view}`}
                className="rounded-md border bg-background p-2 text-sm"
                value={current?.revision ?? versions[0]!.revision}
                disabled={!current}
                onChange={(e) =>
                  change({
                    ...selected,
                    documents: selected.documents.map((d) =>
                      d.viewId === view ? { ...d, revision: Number(e.target.value) } : d,
                    ),
                  })
                }
              >
                {versions.map((d) => (
                  <option key={d.revision} value={d.revision}>
                    Revision {d.revision} · {d.savedAt ?? "saved"}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        {documents.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No saved diagram documents for this model yet.
          </p>
        )}
      </RequestState>
      <details open={views.length === 0}>
        <summary className="cursor-pointer text-sm font-medium">Generated model projections</summary>
        <RequestState query={generated}>
          <div className="mt-3 space-y-2">
            {compatibleGenerated.map((d) => (
              <label key={d.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.diagramVersionIds.includes(d.id)}
                  onChange={(e) =>
                    change({
                      ...selected,
                      diagramVersionIds: e.target.checked
                        ? [...selected.diagramVersionIds, d.id]
                        : selected.diagramVersionIds.filter((id) => id !== d.id),
                    })
                  }
                />
                <span>
                  {diagramTypeLabel(projectionDiagramType(d.notation, d.level))}
                  <span className="block break-all text-xs text-muted-foreground">{d.id}</span>
                </span>
              </label>
            ))}
          </div>
        </RequestState>
      </details>
    </section>
  );
}
