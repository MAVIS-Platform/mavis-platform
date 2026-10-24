"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ArchitecturalModel } from "@/types/domain";
import { DependencyNetwork } from "./dependency-network";
import { ArchitectureDiagrams } from "./architecture-diagrams";
import { SelectionThreeE } from "./selection-three-e";
type Props = {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};
export function ArchitecturePresentation({ model, selectedId, onSelect }: Props) {
  const [highlight, setHighlight] = useState<{ modelId: string; ids: string[] } | null>(null);
  const [mode, setMode] = useState<"graph" | "diagram">("graph");
  return (
    <div
      data-architecture-workspace
      className="mt-5 space-y-4 [&:fullscreen]:m-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-4"
    >
      <div role="tablist" aria-label="Architecture mode" className="flex gap-2">
        <Button
          role="tab"
          aria-selected={mode === "graph"}
          variant={mode === "graph" ? "default" : "outline"}
          onClick={() => setMode("graph")}
        >
          Graph
        </Button>
        <Button
          role="tab"
          aria-selected={mode === "diagram"}
          variant={mode === "diagram" ? "default" : "outline"}
          onClick={() => setMode("diagram")}
        >
          Diagram
        </Button>
      </div>
      <div
        className={
          selectedId
            ? "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]"
            : "min-w-0"
        }
      >
        <div className="min-w-0">
          {mode === "graph" ? (
            <DependencyNetwork
              key={model.id}
              model={model}
              selectedId={selectedId}
              onSelect={(id) => {
                setHighlight(null);
                onSelect(id);
              }}
              highlightIds={highlight?.modelId === model.id ? highlight.ids : []}
              onClearHighlight={() => setHighlight(null)}
            />
          ) : (
            <ArchitectureDiagrams
              key={model.id}
              model={model}
              selectedId={selectedId}
              onSelect={(id) => {
                setHighlight(null);
                onSelect(id);
              }}
            />
          )}
        </div>
        {selectedId && (
          <SelectionThreeE
            key={`${model.id}:${selectedId}`}
            model={model}
            selectedId={selectedId}
            onSelect={(id) => {
              setHighlight(null);
              onSelect(id);
            }}
            onClose={() => {
              setHighlight(null);
              onSelect(null);
            }}
            {...(mode === "graph"
              ? { onHighlight: (ids: string[]) => setHighlight({ modelId: model.id, ids }) }
              : {})}
          />
        )}
      </div>
    </div>
  );
}
