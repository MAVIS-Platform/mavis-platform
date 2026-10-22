"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { ProjectSelector } from "@/features/projects/components";
import { ElementDetailsPanel, ModelVersionSelector } from "@/features/architecture/components";
import { AIExplanationPanel } from "@/features/ai-explanations/components";
import { useModel } from "@/features/architecture/use-model";
import type { ArchitecturalModel } from "@/types/domain";
import { useApi } from "@/hooks/use-api";
import { FlowFrame } from "@/components/mainflow/shell";
import { ModelFlow } from "@/components/mainflow/model-flow";
export default function ExplainPage() {
  return (
    <AppShell>
      <ExplainWorkspace />
    </AppShell>
  );
}
function ExplainWorkspace() {
  const state = useModel();
  return (
    <PageContainer>
      <SectionHeader
        title="AI Explanations"
        description="Separate source evidence from interpretation. Select an exact model version."
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
              <Explanation key={state.model.id} model={state.model} />
            </>
          )}
        </RequestState>
      )}
    </PageContainer>
  );
}
function Explanation({ model }: { model: ArchitecturalModel }) {
  const [elementId, setElementId] = useState(model.elements[0]?.id ?? "");
  return (
    <div className="mt-5 space-y-4">
      <SelectField
        label="Architecture element"
        value={elementId}
        onChange={setElementId}
        options={model.elements.map((e) => ({ value: e.id, label: e.name }))}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <ElementDetailsPanel model={model} selectedId={elementId} />
        <AIExplanationPanel key={elementId} model={model} elementId={elementId} />
      </div>
    </div>
  );
}
