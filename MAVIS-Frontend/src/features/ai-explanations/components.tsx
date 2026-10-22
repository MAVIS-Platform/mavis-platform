"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailPanel } from "@/components/shared/data";
import { ErrorState } from "@/components/shared/request-state";
import { useApiMutation } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
export function AIExplanationPanel({
  model,
  elementId,
}: {
  model: ArchitecturalModel;
  elementId: string;
}) {
  const generate = useApiMutation("explain");
  const current =
    generate.data?.modelId === model.id && generate.data.elementId === elementId
      ? generate.data
      : null;
  return (
    <DetailPanel title="AI explanation">
      <Badge variant="ai">Interpretation · verify against evidence</Badge>
      <Button
        disabled={!elementId || generate.isPending}
        onClick={() => generate.mutate({ modelId: model.id, elementId })}
      >
        {generate.isPending
          ? "Generating…"
          : current
            ? "Regenerate explanation"
            : "Request explanation"}
      </Button>
      {generate.isError && (
        <ErrorState
          error={generate.error}
          onRetry={() => generate.mutate({ modelId: model.id, elementId })}
        />
      )}
      {current ? (
        <>
          <p className="text-sm leading-6 text-muted-foreground">{current.text}</p>
          {current.sample && <Badge variant="outline">Sample text · no AI service called</Badge>}
          <p className="break-all text-xs text-muted-foreground">
            Evidence: {current.evidenceIds.join(", ") || "No attached evidence"}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select an element and request an explanation grounded in its evidence.
        </p>
      )}
    </DetailPanel>
  );
}
