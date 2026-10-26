import type { Operation } from "./contracts";

export const mutationInvalidations: Partial<Record<Operation, readonly Operation[]>> = {
  updateProfile: ["session"],
  createWorkspace: ["workspaces"],
  updateWorkspace: ["workspaces"],
  archiveWorkspace: ["workspaces"],
  addWorkspaceMember: ["workspaces"],
  removeWorkspaceMember: ["workspaces"],
  createAssignment: ["assignments"],
  gradeSubmission: ["submissionReview"],
  createReferenceProject:["workspaceProjects","projects"],
  updateAssignment:["assignments"],deleteAssignment:["assignments","assignmentSubmissions"],
  batchWorkspaceMembers:["workspaces"],publishReference:["referenceVersions","snapshots","workspaceProjects"],
  freezeArtifacts:["diagrams"],saveArchitectureDocument:["architectureDocument","documentRevisions"],
  updateFeedback:["submission","submissions","assignmentSubmissions"],deleteFeedback:["submission","submissions","assignmentSubmissions"],
  runtimeStop: ["runtimeReadSessions", "runtimeReadSession"],
  runtimeApprove: ["runtimeReadSessions", "runtimeReadSession"],
  importSource: ["snapshots"],
  importGithub: ["snapshots"],
  createProject: ["projects", "projectOverviews"],
  cancelAnalysis: ["analysisJobs", "analysisJob", "projectOverviews"],
  evaluateModel: ["evaluations"],
  startAnalysis: [
    "analysisJobs",
    "analysisJob",
    "adminJobs",
    "projects",
    "projectOverviews",
    "project",
    "platformSummary",
  ],
  saveModel: ["models", "modelVersions", "model", "compareModels"],
  saveRuntimeConfiguration: ["runtimeConfiguration"],
  createScenario: ["scenarios"],
  saveScenario: ["scenarios"],
  startRuntime: ["runtimeSessions", "runtimeReadSessions", "runtimeReadSession", "platformSummary"],
  stopRuntime: ["runtimeSessions", "runtimeSession", "platformSummary", "audit"],
  submit: ["submissions", "submission", "assignmentSubmissions"],
  feedback: ["submissions", "submission", "assignmentSubmissions"],
  setAccountRole: ["accounts", "audit", "workspaces"],
  setAccountLock: ["accounts", "audit"],
  configureIntegration: ["integrations", "audit"],
  configureProfile: ["profiles", "runtimeConfiguration", "audit"],
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// Unfiltered collections remain eligible; scoped queries only refresh the
// affected project, assignment, submission, model or session when known.
export function mutationScope(operation: Operation, input: unknown, result: unknown) {
  const variables = record(input);
  const data = record(result);
  const scope: Record<string, unknown> = { ...record(data["model"]), ...data, ...variables };
  const resultIds: Partial<Record<Operation, string>> = {
    createProject: "projectId",
    createReferenceProject: "projectId",
    createWorkspace: "workspaceId",
    updateWorkspace: "workspaceId",
    archiveWorkspace: "workspaceId",
    createAssignment: "assignmentId",
    updateAssignment: "assignmentId",
    submit: "submissionId",
    feedback: "submissionId",
    updateFeedback: "submissionId",
    deleteFeedback: "submissionId",
    startAnalysis: "jobId",
    cancelAnalysis: "jobId",
    startRuntime: "sessionId",
    stopRuntime: "sessionId",
    runtimeStop: "sessionId",
    runtimeApprove: "sessionId",
  };
  const idKey = resultIds[operation];
  if (idKey && typeof data["id"] === "string") scope[idKey] = data["id"];
  return scope;
}

export function queryMatchesScope(queryKey: readonly unknown[], scope: Record<string, unknown>) {
  if (queryKey[0] !== "api") return false;
  const filters = record(queryKey[2]);
  return [
    "projectId",
    "workspaceId",
    "assignmentId",
    "submissionId",
    "modelId",
    "sessionId",
    "jobId",
    "viewId",
    "scenarioId",
  ].every(
    (key) =>
      typeof scope[key] !== "string" ||
      typeof filters[key] !== "string" ||
      filters[key] === "*" ||
      filters[key] === scope[key],
  );
}

export function terminalSignature(operation: Operation, data: unknown): string {
  if (
    !["analysisJob", "analysisJobs", "adminJobs", "runtimeSession", "runtimeSessions"].includes(
      operation,
    )
  )
    return "";
  return (Array.isArray(data) ? data : [data])
    .flatMap((value: unknown) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("id" in value) ||
        !("status" in value) ||
        !["completed", "failed", "cancelled", "terminated", "timed-out", "partial"].includes(
          String(value.status),
        )
      )
        return [];
      return [`${String(value.id)}:${String(value.status)}`];
    })
    .sort()
    .join("|");
}
