"use client";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useApiQuery, useSelection } from "@/hooks/use-api";
export function useModel({ loadDetail = true }: { loadDetail?: boolean } = {}) {
  const api = useApi();
  const { projectId } = useSelection();
  const params = useSearchParams();
  const router = useRouter();
  const summaries = useApiQuery(
    api.mode === "backend" ? "modelVersions" : "models",
    { projectId },
    { enabled: !!projectId },
  );
  const models = useMemo(
    () => [...(summaries.data ?? [])].sort((a, b) => b.revision - a.revision),
    [summaries.data],
  );
  const chosen = params.get("model");
  const selected = chosen || models[0]?.id || "";
  useEffect(() => {
    if (api.mode === "backend" && !chosen && selected) {
      const next = new URLSearchParams(params.toString());
      next.set("model", selected);
      router.replace(`?${next}`);
    }
  }, [api.mode, chosen, selected, params, router]);
  const detail = useApiQuery(
    "model",
    { modelId: selected, projectId },
    { enabled: loadDetail && !!selected },
  );
  return {
    query: selected ? detail : summaries,
    models,
    model: detail.data,
    projectId,
    selectModel: (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("model", id);
      next.delete("target");
      router.replace(`?${next}`);
    },
  };
}
