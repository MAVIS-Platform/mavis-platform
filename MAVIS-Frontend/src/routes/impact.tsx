"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { ProjectSelector } from "@/features/projects/components";
import { DependencyPathViewer, ModelVersionSelector } from "@/features/architecture/components";
import { useModel } from "@/features/architecture/use-model";
import { useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
export default function ImpactPage() {
  return (
    <AppShell>
      <ImpactWorkspace />
    </AppShell>
  );
}
function ImpactWorkspace() {
  const state = useModel();
  return (
    <PageContainer>
      <SectionHeader
        title="Change Impact Analysis"
        description="Inspect source-inferred dependency paths for a selected model version."
      />
      <ProjectSelector />
      {state.projectId && (
        <RequestState query={state.query} empty={!state.models.length}>
          {state.model && (
            <>
              <ModelVersionSelector
                models={state.models}
                value={state.model.id}
                onChange={state.selectModel}
              />
              <ImpactResults key={state.model.id} model={state.model} />
            </>
          )}
        </RequestState>
      )}
    </PageContainer>
  );
}
function ImpactResults({ model }: { model: ArchitecturalModel }) {
  const [targetId, setTargetId] = useState(model.elements[0]?.id ?? "");
  const query = useApiQuery(
    "impact",
    { modelId: model.id, targetId },
    { enabled: Boolean(targetId) },
  );
  return (
    <div className="mt-5 space-y-4">
      <SelectField
        label="Change target"
        value={targetId}
        onChange={setTargetId}
        options={model.elements.map((e) => ({ value: e.id, label: e.name }))}
      />
      {targetId && (
        <RequestState query={query} empty={!query.data?.paths.length}>
          {query.data && (
            <>
              <p className="text-sm text-muted-foreground">{query.data.limitations}</p>
              <DependencyPathViewer paths={query.data.paths} />
            </>
          )}
        </RequestState>
      )}
    </div>
  );
}
