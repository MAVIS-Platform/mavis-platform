"use client";
import { diagramTypeLabel } from "@/lib/architecture/coursework-diagram-types";
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
import { ArtifactSelector, type ArtifactSelection } from "./artifact-selector";
import {
  isDeadlinePassed,
  missingDiagramRequirements,
  runtimeEvidenceBlocked,
} from "./submission-readiness";
import { Textarea } from "@/components/ui/textarea";
import type { Assignment } from "@/features/assignments/requirements";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/forms";
export function SubmissionComposer({
  assignmentId,
  workspaceId,
  requirements,
}: {
  assignmentId: string;
  workspaceId: string;
  requirements?: Assignment;
}) {
  const state = useModel();
  const projects = useApiQuery("projects", {});
  const create = useApiMutation("createProject");
  const [projectName, setProjectName] = useState("");
  const selectedProject = projects.data?.find((p) => p.id === state.projectId);
  const compatibleProject =
    selectedProject?.workspaceId === workspaceId &&
    (!selectedProject.assignmentId || selectedProject.assignmentId === assignmentId);
  const sessions = useApiQuery(
    "runtimeSessions",
    { projectId: state.projectId },
    { enabled: Boolean(state.projectId) },
  );
  const [runtimeId, setRuntimeId] = useState("");
  const evaluations = useApiQuery(
    "evaluations",
    { modelId: state.model?.id ?? "" },
    { enabled: !!state.model?.id },
  );
  const [evaluationId, setEvaluationId] = useState("");
  const evaluation = evaluations.data?.find(
    (e) => e.id === evaluationId && e.modelId === state.model?.id,
  );
  const [review, setReview] = useState<Request<"submit"> | null>(null);
  const submit = useApiMutation("submit");
  const freeze = useApiMutation("freezeArtifacts");
  const [artifacts, setArtifacts] = useState<{
    modelId: string;
    selection: ArtifactSelection;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const choice = artifacts?.modelId === state.model?.id ? (artifacts?.selection ?? null) : null;
  const diagrams = useApiQuery(
    "diagrams",
    { modelId: state.model?.id ?? "" },
    { enabled: !!state.model?.id },
  );
  const missing = missingDiagramRequirements(
    requirements?.requiredDiagramTypes ?? [],
    choice,
    diagrams.data ?? [],
  );
  const overdue = isDeadlinePassed(requirements?.dueAt);
  const compatible = (sessions.data ?? []).filter(
    (s) => s.status === "completed" && s.snapshotId === state.model?.snapshotId,
  );
  const selectedRuntime = compatible.find((s) => s.id === runtimeId);
  return (
    <DetailPanel title="Prepare coursework submission">
      <p className="text-sm text-muted-foreground">
        Use a project created for this class. Import and analyze its source, then submit a frozen
        model version here.
      </p>
      {overdue && (
        <p role="alert" className="rounded-lg border p-3 text-sm text-destructive">
          The assignment deadline has passed. Ask your lecturer to extend it before submitting.
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(
            { name: projectName, workspaceId, assignmentId },
            { onSuccess: () => setProjectName("") },
          );
        }}
      >
        <FormField label="New coursework project name">
          {(props) => (
            <Input
              {...props}
              required
              maxLength={255}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          )}
        </FormField>
        <Button disabled={create.isPending}>Create coursework project</Button>
      </form>
      {create.error && <ErrorState error={create.error} />}
      {create.data && (
        <p role="status" className="text-sm">
          Project created.{" "}
          <Link
            className="text-primary underline"
            href={`/import?project=${encodeURIComponent(create.data.id)}&workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}`}
          >
            Import source and run analysis
          </Link>
        </p>
      )}
      <ProjectSelector workspaceId={workspaceId} assignmentId={assignmentId} />
      {!compatibleProject && (
        <p className="text-sm text-muted-foreground">
          Choose a project from this class to prepare your submission.
        </p>
      )}
      {state.projectId && compatibleProject && (
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
              <ArtifactSelector
                key={state.model.id}
                modelId={state.model.id}
                onChange={(selection) => setArtifacts({ modelId: state.model!.id, selection })}
              />
              <SelectField
                label="Evaluation run to submit"
                value={evaluation?.id ?? "none"}
                onChange={setEvaluationId}
                options={[
                  { value: "none", label: "Do not include evaluation" },
                  ...(evaluations.data ?? []).map((e) => ({
                    value: e.id,
                    label: `${e.id} · ${String(e.result["createdAt"] ?? "saved")}`,
                  })),
                ]}
              />
              <p className="text-xs text-muted-foreground">
                Required types:{" "}
                {requirements?.requiredDiagramTypes?.map(diagramTypeLabel).join(", ") ||
                  "Any saved diagram"}
              </p>
              <FormField label="Submission notes">
                {(props) => (
                  <Textarea
                    {...props}
                    value={notes}
                    maxLength={5000}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </FormField>
              <RequestState query={sessions}>
                <SelectField
                  label={
                    requirements?.requireRuntimeTrace
                      ? "Required runtime evidence"
                      : "Optional runtime evidence"
                  }
                  value={selectedRuntime?.id ?? "none"}
                  onChange={setRuntimeId}
                  options={[
                    { value: "none", label: "Do not include runtime evidence" },
                    ...compatible.map((s) => ({ value: s.id, label: s.id })),
                  ]}
                />
              </RequestState>
              <Button
                disabled={
                  submit.isPending ||
                  freeze.isPending ||
                  overdue ||
                  missing.length > 0 ||
                  diagrams.isError ||
                  !choice ||
                  choice.documents.length + choice.diagramVersionIds.length === 0 ||
                  (requirements?.requireRuntimeTrace && !selectedRuntime) ||
                  runtimeEvidenceBlocked(
                    !!requirements?.requireRuntimeTrace,
                    sessions.isPending,
                    sessions.isError,
                  )
                }
                onClick={async () => {
                  if (!state.model || !choice) return;
                  try {
                    const frozen = await freeze.mutateAsync({ modelId: state.model.id, ...choice });
                    setReview({
                      assignmentId,
                      modelId: state.model.id,
                      snapshotId: state.model.snapshotId,
                      diagramVersionId: frozen.diagramVersionId,
                      runtimeSessionId: selectedRuntime?.id ?? null,
                      evaluationRunId: evaluation?.id ?? null,
                      submissionNotes: notes,
                    });
                  } catch {
                    /* Inline error below. */
                  }
                }}
              >
                {freeze.isPending ? "Freezing selected diagram versions…" : "Review submission"}
              </Button>
              {missing.length > 0 && (
                <p role="status" className="text-sm text-muted-foreground">
                  Select the required saved diagrams: {missing.map(diagramTypeLabel).join(", ")}.
                </p>
              )}
              {freeze.error && <ErrorState error={freeze.error} />}
              <ConfirmDialog
                open={Boolean(review && review.modelId === state.model?.id && compatibleProject)}
                onOpenChange={(open) => {
                  if (!open) setReview(null);
                }}
                title="Submit these result versions?"
                description={`Assignment ${review?.assignmentId}; model ${review?.modelId}; source ${review?.snapshotId}; frozen diagram bundle ${review?.diagramVersionId}; runtime ${review?.runtimeSessionId ?? "not included"}.`}
                pending={submit.isPending}
                error={submit.isError ? <ErrorState error={submit.error} /> : undefined}
                onConfirm={() => {
                  if (review && !submit.isPending)
                    submit.mutate(review, { onSuccess: () => setReview(null) });
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
