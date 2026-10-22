"use client";
import { useState } from "react";
import Link from "next/link";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useModel } from "@/features/architecture/use-model";
import { ModelVersionSelector } from "@/features/architecture/components";
import { ProjectSelector } from "@/features/projects/components";
import { ConfirmDialog, SelectField } from "@/components/shared/forms";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { DetailPanel } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import type { Request } from "@/lib/api/contracts";
export function SubmissionComposer({ assignmentId }: { assignmentId: string }) {
  const state = useModel();
  const sessions = useApiQuery(
    "runtimeSessions",
    { projectId: state.projectId },
    { enabled: Boolean(state.projectId) },
  );
  const [runtimeId, setRuntimeId] = useState("");
  const [review, setReview] = useState<Request<"submit"> | null>(null);
  const submit = useApiMutation("submit");
  const compatible = (sessions.data ?? []).filter(
    (s) => s.status === "completed" && s.snapshotId === state.model?.snapshotId,
  );
  const selectedRuntime = compatible.find((s) => s.id === runtimeId);
  return (
    <DetailPanel title="Prepare coursework submission">
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
              <p className="break-all text-xs text-muted-foreground">
                Source snapshot: {state.model.snapshotId}. The model and its matching source will be
                frozen together.
              </p>
              <RequestState query={sessions}>
                <SelectField
                  label="Optional runtime evidence"
                  value={selectedRuntime?.id ?? "none"}
                  onChange={setRuntimeId}
                  options={[
                    { value: "none", label: "Do not include runtime evidence" },
                    ...compatible.map((s) => ({ value: s.id, label: s.id })),
                  ]}
                />
              </RequestState>
              <Button
                disabled={submit.isPending || sessions.isError || sessions.isPending}
                onClick={() => {
                  if (state.model)
                    setReview({
                      assignmentId,
                      modelId: state.model.id,
                      snapshotId: state.model.snapshotId,
                      runtimeSessionId: selectedRuntime?.id ?? null,
                    });
                }}
              >
                Review submission
              </Button>
              <ConfirmDialog
                open={Boolean(review)}
                onOpenChange={(open) => {
                  if (!open) setReview(null);
                }}
                title="Submit these result versions?"
                description={`Assignment ${review?.assignmentId}; model ${review?.modelId}; source ${review?.snapshotId}; runtime ${review?.runtimeSessionId ?? "not included"}.`}
                pending={submit.isPending}
                error={submit.isError ? <ErrorState error={submit.error} /> : undefined}
                onConfirm={() => {
                  if (review) submit.mutate(review, { onSuccess: () => setReview(null) });
                }}
              />
              {submit.data && (
                <p role="status" className="text-sm">
                  Submitted snapshot saved.{" "}
                  <Link
                    className="text-primary underline"
                    href={`/submissions/${encodeURIComponent(submit.data.id)}`}
                  >
                    View submitted version
                  </Link>
                </p>
              )}
            </>
          )}
        </RequestState>
      )}
    </DetailPanel>
  );
}
