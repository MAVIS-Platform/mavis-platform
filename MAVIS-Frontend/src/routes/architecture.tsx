"use client";
import { ArchitecturePresentation } from "@/features/architecture/architecture-presentation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { ProjectSelector } from "@/features/projects/components";
import { ModelVersionSelector } from "@/features/architecture/components";
import { useModel } from "@/features/architecture/use-model";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { FlowFrame } from "@/components/mainflow/shell";
import { ModelFlow } from "@/components/mainflow/model-flow";
export default function ArchitecturePage() {
  return (
    <AppShell>
      <ArchitectureWorkspace title="Architecture Graph Explorer" mode="graph" />
    </AppShell>
  );
}
export function ArchitectureWorkspace({
  title = "Architecture Graph Explorer",
  mode,
}: {
  title?: string;
  mode?: "graph" | "diagram";
} = {}) {
  const resolvedMode =
    mode ?? (title.toLowerCase().includes("diagram") ? "diagram" : "graph");
  const state = useModel();
  const project = useApiQuery(
    "project",
    { projectId: state.projectId },
    { enabled: !!state.projectId },
  );
  const [selected, setSelected] = useState<{ modelId: string; elementId: string } | null>(null);
  const id = selected?.modelId === state.model?.id ? (selected?.elementId ?? null) : null;
  return (
    <PageContainer>
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
          <div className="w-full sm:w-64">
            <ProjectSelector />
          </div>
          {state.projectId && state.model && (
            <>
              <div className="w-full sm:w-80">
                <ModelVersionSelector
                  models={state.models}
                  value={state.model.id}
                  onChange={state.selectModel}
                />
              </div>
            </>
          )}
        </div>
        {state.projectId &&
          (state.models.length === 0 ? (
            <div className="space-y-4 rounded-xl border bg-card p-8 text-center">
              <h2 className="text-base font-semibold">Project Not Analyzed Yet</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                No architecture model has been generated for this project yet. Run snapshot analysis to extract architecture models, components, and diagrams.
              </p>
              <Button asChild>
                <Link href={`/snapshots?project=${state.projectId}`}>
                  Analyze Source Snapshot
                </Link>
              </Button>
            </div>
          ) : (
            <RequestState query={state.query}>
              {state.model && (
                <ArchitecturePresentation
                  model={state.model}
                  mode={resolvedMode}
                  selectedId={id}
                  systemName={project.data?.name}
                  onSelect={(elementId) => {
                    if (state.model)
                      setSelected(elementId ? { modelId: state.model.id, elementId } : null);
                  }}
                />
              )}
            </RequestState>
          ))}
      </div>
    </PageContainer>
  );
}

