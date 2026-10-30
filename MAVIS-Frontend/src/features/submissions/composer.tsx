"use client";
import { diagramTypeLabel } from "@/lib/architecture/coursework-diagram-types";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
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
  const selection = useSelection();
  const state = useModel();
  const projects = useApiQuery("projects", {});
  const create = useApiMutation("createProject");
  const [projectName, setProjectName] = useState("");
  const [useReferenceSnapshot, setUseReferenceSnapshot] = useState(true);

  const selectedProject = projects.data?.find((p) => p.id === state.projectId);
  const compatibleProject =
    selectedProject?.workspaceId === workspaceId &&
    (!selectedProject.assignmentId || selectedProject.assignmentId === assignmentId);

  const classProjects = (projects.data ?? []).filter(
    (p) => p.workspaceId === workspaceId && (!p.assignmentId || p.assignmentId === assignmentId),
  );
  const personalProjectsCount = (projects.data ?? []).filter((p) => !p.workspaceId).length;

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
  const runEvaluation = useApiMutation("evaluateModel");
  const [evaluationId, setEvaluationId] = useState("");

  // Auto-select latest evaluation run when evaluations load
  useEffect(() => {
    if (!evaluationId && evaluations.data && evaluations.data.length > 0) {
      const first = evaluations.data[0];
      if (first) setEvaluationId(first.id);
    }
  }, [evaluationId, evaluations.data]);

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
  const compatible = useMemo(() => {
    const allCompleted = (sessions.data ?? []).filter(
      (s) =>
        s.status === "completed" ||
        String(s.status).toUpperCase() === "COMPLETED" ||
        String(s.executionStatus).toUpperCase() === "COMPLETED",
    );
    if (!state.model) return allCompleted;
    const exactMatch = allCompleted.filter(
      (s) =>
        s.snapshotId === state.model?.snapshotId ||
        s.modelId === state.model?.id ||
        s.enrichedModelId === state.model?.id,
    );
    return exactMatch.length > 0 ? exactMatch : allCompleted;
  }, [sessions.data, state.model]);
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
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(
            {
              name: projectName.trim(),
              workspaceId,
              assignmentId,
              ...(useReferenceSnapshot && requirements?.referenceSource?.snapshotId
                ? { referenceSnapshotId: requirements.referenceSource.snapshotId }
                : {}),
            },
            {
              onSuccess: (createdProject) => {
                setProjectName("");
                selection.setProjectId(createdProject.id);
              },
            },
          );
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
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
          <Button disabled={create.isPending}>
            {create.isPending ? "Creating project…" : "Create coursework project"}
          </Button>
        </div>
        {requirements?.referenceSource?.snapshotId && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={useReferenceSnapshot}
              onChange={(e) => setUseReferenceSnapshot(e.target.checked)}
            />
            <span>
              Initialize project with Lecturer&apos;s assigned reference source (
              <strong>{requirements.referenceSource.projectName}</strong>)
            </span>
          </label>
        )}
      </form>
      {create.error && <ErrorState error={create.error} />}
      {create.data && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <p role="status">
            Project <strong>{create.data.name}</strong> created and selected.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href={`/snapshots?project=${encodeURIComponent(create.data.id)}`}>
                Analyze Snapshot
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/import?project=${encodeURIComponent(create.data.id)}&workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}`}
              >
                Import source and run analysis
              </Link>
            </Button>
          </div>
        </div>
      )}
      <ProjectSelector workspaceId={workspaceId} assignmentId={assignmentId} />
      {classProjects.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
          You don&apos;t have a project in this class workspace yet. Enter a name above and click{" "}
          <strong>Create coursework project</strong> to start
          {personalProjectsCount > 0 ? (
            <span>
              {" "}
              (Note: {personalProjectsCount} personal project(s) created outside this class cannot
              be submitted to class assignments).
            </span>
          ) : (
            "."
          )}
        </div>
      )}
      {!compatibleProject && classProjects.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Choose a project from this class to prepare your submission.
        </p>
      )}
      {state.projectId && compatibleProject && (
        <RequestState
          query={state.query}
          empty={!state.models.length}
          emptyMessage="This project does not have an analyzed model version yet."
        >
          {!state.models.length ? (
            <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm font-medium">No architecture model revisions found</p>
              <p className="text-xs text-muted-foreground">
                To submit this assignment, you must import source code and run static analysis to
                produce an architecture model revision.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Button asChild size="sm">
                  <Link
                    href={`/snapshots?project=${encodeURIComponent(state.projectId)}&import=1`}
                  >
                    Import Source &amp; Analyze
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/snapshots?project=${encodeURIComponent(state.projectId)}`}>
                    Go to Source Snapshots
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            state.model && (
              <>
                <ModelVersionSelector
                  models={state.models}
                  value={state.model.id}
                  onChange={state.selectModel}
                />
                <p className="break-all text-xs text-muted-foreground">
                  Source snapshot: {state.model.snapshotId}. The model and its matching source will
                  be frozen together.
                </p>
                <ArtifactSelector
                  key={state.model.id}
                  modelId={state.model.id}
                  onChange={(selection) => setArtifacts({ modelId: state.model!.id, selection })}
                />
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
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
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={runEvaluation.isPending || !state.model?.id}
                    onClick={() => {
                      if (!state.model?.id) return;
                      runEvaluation.mutate(
                        { modelId: state.model.id },
                        {
                          onSuccess: (res) => {
                            setEvaluationId(res.id);
                            evaluations.refetch();
                          },
                        },
                      );
                    }}
                  >
                    {runEvaluation.isPending
                      ? "Evaluating 5 Architecture Rules…"
                      : evaluations.data?.length
                        ? "Re-run Rule Evaluation"
                        : "Run Architecture Rule Evaluation (5 Rules)"}
                  </Button>
                </div>
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
                    value={selectedRuntime?.id ?? ""}
                    onChange={setRuntimeId}
                    options={[
                      { value: "", label: "No runtime trace attached" },
                      ...compatible.map((s) => {
                        const sAny = s as Record<string, unknown>;
                        const title =
                          typeof sAny["scenarioName"] === "string" && sAny["scenarioName"]
                            ? sAny["scenarioName"]
                            : s.scenarioId || "Runtime Session";
                        const count =
                          typeof sAny["traceCount"] === "number"
                            ? sAny["traceCount"]
                            : (s.traces?.length ?? 0);
                        return {
                          value: s.id,
                          label: `${title} · #${s.id.slice(0, 8)} (${count} spans)`,
                        };
                      }),
                    ]}
                  />
                </RequestState>

                {/* Submission Readiness Checklist */}
                <div className="space-y-2.5 rounded-lg border bg-card p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Submission Readiness Checklist
                  </h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          state.model ? "font-bold text-success" : "font-bold text-amber-500"
                        }
                      >
                        {state.model ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>Class Project &amp; Analyzed Model Version:</strong>{" "}
                        {state.model ? (
                          <span>
                            Selected Revision {state.model.revision} (
                            {state.model.label || state.model.id})
                          </span>
                        ) : (
                          <Link
                            className="text-primary underline"
                            href={`/snapshots?project=${encodeURIComponent(state.projectId)}`}
                          >
                            Analyze a snapshot first
                          </Link>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          missing.length === 0 &&
                          (choice
                            ? choice.documents.length + choice.diagramVersionIds.length > 0
                            : false)
                            ? "font-bold text-success"
                            : "font-bold text-amber-500"
                        }
                      >
                        {missing.length === 0 &&
                        (choice
                          ? choice.documents.length + choice.diagramVersionIds.length > 0
                          : false)
                          ? "✓"
                          : "!"}
                      </span>
                      <span>
                        <strong>Required Diagrams:</strong>{" "}
                        {missing.length === 0 &&
                        (choice
                          ? choice.documents.length + choice.diagramVersionIds.length > 0
                          : false) ? (
                          <span>All required diagram types selected</span>
                        ) : (
                          <span>
                            Missing {missing.map(diagramTypeLabel).join(", ") || "diagram selection"}{" "}
                            —{" "}
                            <Link
                              className="text-primary underline"
                              href={`/diagrams?project=${encodeURIComponent(state.projectId)}&model=${encodeURIComponent(state.model.id)}`}
                            >
                              Open Diagrams &amp; Save
                            </Link>
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          !requirements?.requireRuntimeTrace || Boolean(selectedRuntime)
                            ? "font-bold text-success"
                            : "font-bold text-amber-500"
                        }
                      >
                        {!requirements?.requireRuntimeTrace || Boolean(selectedRuntime) ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>Runtime Trace Evidence:</strong>{" "}
                        {requirements?.requireRuntimeTrace ? (
                          selectedRuntime ? (
                            <span>Completed session attached ({selectedRuntime.id})</span>
                          ) : (
                            <span>
                              Required for this assignment —{" "}
                              <Link
                                className="text-primary underline"
                                href={`/sessions?project=${encodeURIComponent(state.projectId)}`}
                              >
                                Run runtime session
                              </Link>
                            </span>
                          )
                        ) : (
                          <span>
                            Optional (
                            {selectedRuntime ? `Attached ${selectedRuntime.id}` : "Not included"})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          !overdue ? "font-bold text-success" : "font-bold text-destructive"
                        }
                      >
                        {!overdue ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>Deadline:</strong>{" "}
                        {overdue ? "Past deadline" : `Due ${requirements?.dueAt || "No deadline"}`}
                      </span>
                    </div>
                  </div>
                </div>

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
                      const frozen = await freeze.mutateAsync({
                        modelId: state.model.id,
                        ...choice,
                      });
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
            )
          )}
        </RequestState>
      )}
    </DetailPanel>
  );
}
