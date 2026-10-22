"use client";
import { useState } from "react";
import { useApiQuery, useSelection } from "@/hooks/use-api";
export function useModel() {
  const { projectId } = useSelection();
  const query = useApiQuery("models", { projectId }, { enabled: Boolean(projectId) });
  const [choice, setChoice] = useState<{ projectId: string; modelId: string } | null>(null);
  const models = query.data ?? [];
  const model =
    models.find((m) => choice?.projectId === projectId && m.id === choice.modelId) ?? models.at(-1);
  return {
    query,
    models,
    model,
    selectModel: (modelId: string) => setChoice({ projectId, modelId }),
    projectId,
  };
}
