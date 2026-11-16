"use client";
import { diagramTypeLabel } from "@/lib/architecture/coursework-diagram-types";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
import { useModel } from "@/features/architecture/use-model";
import { useCourseQuiz } from "@/features/courses/course-quiz";
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
import { useLocale } from "@/lib/i18n/locale-context";
import type { StudentSnapshotItem } from "@/types/domain";

export function SubmissionComposer({
  assignmentId,
  workspaceId,
  requirements,
  guided = false,
}: {
  assignmentId: string;
  workspaceId: string;
  requirements?: Assignment;
  guided?: boolean;
}) {
  const { t } = useLocale();
  const client = useApi();
  const queryClient = useQueryClient();
  const selection = useSelection();
  const state = useModel();
  const projects = useApiQuery("projects", {});
  const create = useApiMutation("createProject");
  const [projectName, setProjectName] = useState("");
  const [prefilledName, setPrefilledName] = useState(false);
  const [useReferenceSnapshot, setUseReferenceSnapshot] = useState(true);
  const [startingStaticAnalysis, setStartingStaticAnalysis] = useState(false);
  const [staticAnalysisError, setStaticAnalysisError] = useState<string | null>(null);

  const selectedProject = projects.data?.find((p) => p.id === state.projectId);
  const compatibleProject =
    selectedProject?.workspaceId === workspaceId &&
    (selectedProject.assignmentId === assignmentId || (!guided && !selectedProject.assignmentId));

  const classProjects = (projects.data ?? []).filter(
    (p) =>
      p.workspaceId === workspaceId &&
      (p.assignmentId === assignmentId || (!guided && !p.assignmentId)),
  );
  const personalProjectsCount = (projects.data ?? []).filter((p) => !p.workspaceId).length;

  // Auto-select the student's Lab project when entering composer with no compatible project active
  useEffect(() => {
    if (!compatibleProject && classProjects.length > 0) {
      selection.setProjectId(classProjects[0]!.id);
    }
  }, [compatibleProject, classProjects, selection]);

  useEffect(() => {
    if (
      guided &&
      !prefilledName &&
      projects.data &&
      classProjects.length === 0 &&
      !projectName &&
      requirements?.title
    ) {
      setProjectName(`${requirements.title} - Workspace`.slice(0, 255));
      setPrefilledName(true);
    }
  }, [guided, prefilledName, projects.data, classProjects.length, projectName, requirements?.title]);

  async function handleRunStaticAnalysis() {
    if (!state.projectId || startingStaticAnalysis) return;
    setStartingStaticAnalysis(true);
    setStaticAnalysisError(null);
    try {
      const snaps = await client.execute("snapshots", { projectId: state.projectId });
      const targetSnapshot = snaps[0];
      if (!targetSnapshot) {
        throw new Error("No source snapshot found yet. Open Source Snapshots to import or clone one first.");
      }
      await client.execute("startAnalysis", {
        projectId: state.projectId,
        snapshotId: targetSnapshot.id,
        idempotencyKey: `composer-analyze-${state.projectId}-${targetSnapshot.id}`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["api", "analysisJobs"] }),
        queryClient.invalidateQueries({ queryKey: ["api", "modelVersions"] }),
        queryClient.invalidateQueries({ queryKey: ["api", "models"] }),
      ]);
    } catch (err) {
      setStaticAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setStartingStaticAnalysis(false);
    }
  }

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
  const [staticExplanation, setStaticExplanation] = useState("");
  const [runtimeExplanation, setRuntimeExplanation] = useState("");
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
  const requiresRuntime = requirements?.requireRuntimeTrace === true;
  const requiresStudio = guided && requiresRuntime;
  const quiz = useCourseQuiz(workspaceId, assignmentId, guided);
  const labHref = `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}`;
  const compatible = useMemo(() => {
    const allCompleted = (sessions.data ?? []).filter(
      (s) =>
        s.status === "completed" ||
        String(s.status).toUpperCase() === "COMPLETED" ||
        String(s.executionStatus).toUpperCase() === "COMPLETED",
    );
    if (requiresStudio) {
      const model = state.model;
      if (!model) return [];
      return allCompleted.filter((s) => s.studioVerified && s.snapshotId === model.snapshotId
        && (s.modelId === model.id || s.enrichedModelId === model.id));
    }
    if (!state.model) return allCompleted;
    const exactMatch = allCompleted.filter(
      (s) =>
        s.snapshotId === state.model?.snapshotId ||
        s.modelId === state.model?.id ||
        s.enrichedModelId === state.model?.id,
    );
    return exactMatch.length > 0 ? exactMatch : allCompleted;
  }, [sessions.data, state.model, requiresStudio]);
  const selectedRuntime = compatible.find((s) => s.id === runtimeId);
  const studioCaptured = useApiQuery("studioState", { sessionId: selectedRuntime?.id ?? "" },
    { enabled: Boolean(selectedRuntime) && client.mode === "backend" && (!guided || requiresStudio) });
  const capturedStudioSnapshots = studioCaptured.data?.snapshots ?? [];
  const interactiveStudio = studioCaptured.data?.interactive === true;

  // Auto-select the latest compatible runtime/Studio session so Stage 3 & Stage 4 populate immediately
  useEffect(() => {
    if (compatible.length > 0 && !compatible.some((s) => s.id === runtimeId)) {
      setRuntimeId(compatible[0]!.id);
    }
  }, [compatible, runtimeId]);
  const stage2Ready = guided ? !quiz.isError && quiz.data?.passed === true : missing.length === 0 && Boolean(choice);
  const stage3Ready =
    Boolean(selectedRuntime) &&
    String(selectedRuntime?.evidenceStatus ?? "").toUpperCase() === "AVAILABLE";
  const stage4Ready =
    stage3Ready && selectedRuntime?.studioVerified === true && (client.mode!=="backend" ||
      (!studioCaptured.isPending && !studioCaptured.isError &&
       (!studioCaptured.data?.interactive || capturedStudioSnapshots.length>0)));
  const preparedSnapshots: StudentSnapshotItem[] = [
    ...(staticExplanation.trim()
      ? [
          {
            snapshotId: "STEP_1_STATIC",
            step: "STEP_1_STATIC",
            title: "Snapshot 1 · Static C1–C3 Architecture & 3E Reasoning",
            targetViewOrService: state.model?.label || state.model?.id || "architecture-model",
            writtenExplanation: staticExplanation.trim(),
            capturedAt: new Date().toISOString(),
          },
        ]
      : []),
    ...(interactiveStudio
      ? capturedStudioSnapshots.map((snapshot, index) => ({
          snapshotId: snapshot.id,
          step: "STEP_4_RUNTIME",
          title: `Studio snapshot ${index + 1}`,
          targetViewOrService: selectedRuntime?.id ?? "",
          capturedAt: snapshot.capturedAt,
          writtenExplanation: snapshot.explanation,
        }))
      : (!guided || requiresStudio) && !interactiveStudio && runtimeExplanation.trim()
      ? [
          {
            snapshotId: "STEP_4_RUNTIME",
            step: "STEP_4_RUNTIME",
            title: "Snapshot 2 · MAVIS Studio Runtime Stop/Scale Before-After Analysis",
            targetViewOrService: selectedRuntime?.id || "runtime-session",
            writtenExplanation: runtimeExplanation.trim(),
            capturedAt: new Date().toISOString(),
          },
        ]
      : []),
  ];
  const hasWrittenExplanation =
    staticExplanation.trim().length > 0
    && (!requiresStudio || (interactiveStudio ? capturedStudioSnapshots.length > 0 : runtimeExplanation.trim().length > 0));

  return (
    <div id="submission-composer" className="scroll-mt-20">
    <DetailPanel title="Prepare coursework submission">
      <p className="text-sm text-muted-foreground">
        {guided
          ? "Create your lab project from the assigned source, then analyze its snapshot."
          : "Use a project created for this class. Import and analyze its source, then submit a frozen model version here."}
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
              ...((guided || useReferenceSnapshot) && requirements?.referenceSource?.snapshotId
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
        {!guided && requirements?.referenceSource?.snapshotId && (
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
            {!guided && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/import?project=${encodeURIComponent(create.data.id)}&workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}`}
                >
                  Import source and run analysis
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
      <ProjectSelector
        workspaceId={workspaceId}
        assignmentId={assignmentId}
        requireAssignment={guided}
      />
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
                {guided
                  ? "Run static analysis on the assigned snapshot to produce an architecture model revision."
                  : "Import source code and run static analysis to produce an architecture model revision."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={startingStaticAnalysis}
                  onClick={() => void handleRunStaticAnalysis()}
                >
                  {startingStaticAnalysis ? "Starting Static Analysis…" : "Run Static Analysis Now"}
                </Button>
                {!guided && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/snapshots?project=${encodeURIComponent(state.projectId)}&import=1`}
                    >
                      Import Source &amp; Analyze
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/snapshots?project=${encodeURIComponent(state.projectId)}`}>
                    Go to Source Snapshots
                  </Link>
                </Button>
              </div>
              {staticAnalysisError && (
                <p role="alert" className="text-xs text-destructive">
                  {staticAnalysisError}
                </p>
              )}
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
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("Captured Snapshots & Written Theoretical Explanations")}
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      {guided
                        ? t("Required before Guided Lab submission")
                        : t("Optional snapshot theoretical notes")}
                    </span>
                  </div>
                  <FormField
                    label="Snapshot 1 · Static C1–C3 Architecture & 3E Reasoning"
                    sublabel={guided ? t("Required", "Bắt buộc") : undefined}
                  >
                    {(props) => (
                      <Textarea
                        {...props}
                        rows={2}
                        maxLength={5000}
                        placeholder={t(
                          "Explain service boundaries, call-site evidence (3E), and dependency direction observed in C1–C3 views…",
                        )}
                        value={staticExplanation}
                        onChange={(e) => setStaticExplanation(e.target.value)}
                      />
                    )}
                  </FormField>
                  {(!guided || requiresStudio) && !interactiveStudio && (
                    <FormField
                      label="Snapshot 2 · MAVIS Studio Runtime Stop/Scale Before-After Analysis"
                      sublabel={requiresStudio ? t("Required", "Bắt buộc") : undefined}
                    >
                      {(props) => (
                        <Textarea
                          {...props}
                          rows={2}
                          maxLength={5000}
                          placeholder={t(
                            "Explain observed OTel trace propagation and Stop/Start/Scale Before vs. After impact…",
                          )}
                          value={runtimeExplanation}
                          onChange={(e) => setRuntimeExplanation(e.target.value)}
                        />
                      )}
                    </FormField>
                  )}
                  {capturedStudioSnapshots.length > 0 && (!guided || requiresStudio) && (
                    <div className="space-y-1 text-sm">
                      <p>{t("Studio snapshots attached")}: {capturedStudioSnapshots.length}</p>
                      {capturedStudioSnapshots.map((snapshot) => <p key={snapshot.id}>{snapshot.explanation}</p>)}
                    </div>
                  )}
                  {studioCaptured.isError && <ErrorState error={studioCaptured.error} onRetry={() => void studioCaptured.refetch()} />}
                  {guided && !hasWrittenExplanation && (
                    <p role="status" className="text-xs text-amber-600">
                      {t("Add an explanation for each required Snapshot.", "Hãy giải trình cho từng Snapshot bắt buộc.")}
                    </p>
                  )}
                </div>
                <FormField label={t("Submission notes")}>
                  {(props) => (
                    <Textarea
                      {...props}
                      value={notes}
                      maxLength={5000}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  )}
                </FormField>
                {(!guided || requiresStudio) && (
                  <RequestState query={sessions}>
                    <SelectField
                      label={
                        requirements?.requireRuntimeTrace
                          ? (requiresStudio ? "Required verified Studio evidence" : "Required runtime evidence")
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

                )}

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
                        <strong>Step 1 · Static C1–C3 &amp; AI:</strong>{" "}
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
                          stage2Ready
                            ? "font-bold text-success"
                            : "font-bold text-amber-500"
                        }
                      >
                        {stage2Ready ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>{guided ? t("Step 2 · Theory Quiz", "Bước 2 · Quiz lý thuyết") : t("Diagram requirements", "Yêu cầu sơ đồ")}</strong>{" "}
                        {guided ? (
                          quiz.isError ? (
                            <Button type="button" variant="link" size="sm" onClick={() => void quiz.refetch()}>
                              {t("Retry loading Quiz status", "Tải lại trạng thái Quiz")}
                            </Button>
                          ) : quiz.isPending ? (
                            <span>{t("Loading Quiz…", "Đang tải Quiz…")}</span>
                          ) : stage2Ready ? (
                            <span>{t("Passed", "Đã đạt")}</span>
                          ) : (
                            <Link className="text-primary underline" href={`${labHref}&step=2`}>
                              {t("Pass the current Lab Quiz", "Hoàn thành Quiz hiện hành của Lab")}
                            </Link>
                          )
                        ) : (
                          stage2Ready
                            ? t("Required diagrams selected", "Đã chọn sơ đồ bắt buộc")
                            : t("Select the required saved diagrams", "Chọn các sơ đồ bắt buộc đã lưu")
                        )}
                      </span>
                    </div>
                    {(!guided || requiresStudio) && (
                    <>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          stage3Ready
                            ? "font-bold text-success"
                            : "font-bold text-amber-500"
                        }
                      >
                        {stage3Ready ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>Step 3 · OpenTelemetry Runtime View:</strong>{" "}
                        {stage3Ready ? (
                          <span>Verified runtime evidence attached ({selectedRuntime?.id})</span>
                        ) : (
                          <span>
                            Select a completed session with available evidence —{" "}
                            <Link className="text-primary underline" href={guided ? `${labHref}&step=3` : `/sessions?project=${encodeURIComponent(state.projectId)}`}>
                              Run runtime session
                            </Link>
                          </span>
                        )}
                      </span>
                    </div>
                    {requiresStudio && (
                    <div className="flex items-center gap-2">
                      <span className={stage4Ready ? "font-bold text-success" : "font-bold text-amber-500"}>
                        {stage4Ready ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>{t("Step 4 · MAVIS Studio RuntimeReceipt", "Bước 4 · Biên nhận MAVIS Studio")}</strong>{" "}
                        {stage4Ready
                          ? "Signed receipt and zero-orphan cleanup confirmed"
                          : (
                            <Link className="text-primary underline" href={`${labHref}&step=4`}>
                              {t("Complete Studio and wait for confirmed cleanup", "Hoàn thành Studio và chờ xác nhận dọn dẹp")}
                            </Link>
                          )}
                      </span>
                    </div>
                    )}
                    </>
                    )}
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
                    (guided && !stage2Ready) ||
                    (requiresStudio && !stage4Ready) ||
                    (guided && !hasWrittenExplanation) ||
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
                        runtimeSessionId: guided && !requiresStudio ? null : selectedRuntime?.id ?? null,
                        evaluationRunId: evaluation?.id ?? null,
                        submissionNotes: notes,
                        ...(preparedSnapshots.length > 0
                          ? { studentSnapshots: preparedSnapshots }
                          : {}),
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
    </div>
  );
}
