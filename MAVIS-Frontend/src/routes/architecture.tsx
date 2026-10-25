"use client";
import { ArchitecturePresentation } from "@/features/architecture/architecture-presentation";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
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
      <ArchitectureWorkspace />
    </AppShell>
  );
}
export function ArchitectureWorkspace({ title = "Architecture" }: { title?: string } = {}) {
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
      <SectionHeader
        title={title}
        description="Explore the dependency graph or a C4 / 4+1 diagram. Select an element to open 3E."
      />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <ProjectSelector />
        {state.projectId && state.model && (
          <ModelVersionSelector
            models={state.models}
            value={state.model.id}
            onChange={state.selectModel}
          />
        )}
      </div>
      {state.projectId && (
        <RequestState query={state.query} empty={state.models.length === 0}>
          {state.model && (
            <ArchitecturePresentation
              model={state.model}
              selectedId={id}
              systemName={project.data?.name}
              onSelect={(elementId) => {
                if (state.model)
                  setSelected(elementId ? { modelId: state.model.id, elementId } : null);
              }}
            />
          )}
        </RequestState>
      )}
    </PageContainer>
  );
}
