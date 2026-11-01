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
  runtimeStop: ["runtimeReadSessions", "runtimeReadSession", "runtimeSessions", "runtimeSession"],
  runtimeApprove: [
    "runtimeReadSessions",
    "runtimeReadSession",
    "runtimeSessions",
    "runtimeSession",
    "runtimeSequence",
    "models",
    "modelVersions",
    "model",
    "diagrams",
  ],
  importSource: ["snapshots"],
  importGithub: ["snapshots"],
  createProject: ["projects", "projectOverviews"],
  cancelAnalysis: ["projectAnalysisActivity", "projectActivity", "analysisJobs", "analysisJob", "projectOverviews"],
  evaluateModel: ["evaluations"],
  startAnalysis: [
    "projectAnalysisActivity", "projectActivity",
    "analysisJobs",
    "analysisJob",
    "adminJobs",
    "projects",
    "projectOverviews",
    "project",
    "platformSummary",
  ],
  reviewContext: ["models", "modelVersions", "model", "compareModels"],
  deleteProject: ["audit","projects","projectOverviews","project","snapshots","models","modelVersions","analysisJobs","projectAnalysisActivity", "projectActivity","platformSummary"],
  deleteSnapshot: ["audit","snapshots","models","modelVersions","model","analysisJobs","projectOverviews","project","projectAnalysisActivity", "projectActivity","platformSummary"],
  saveModel: ["models", "modelVersions", "model", "compareModels"],
  saveRuntimeConfiguration: ["runtimeConfiguration"],
  buildRuntimeSandboxImages: ["runtimeConfiguration"],
  createScenario: ["scenarios"],
  saveScenario: ["scenarios"],
  startRuntime: [
    "runtimeSessions",
    "runtimeSession",
    "runtimeReadSessions",
    "runtimeReadSession",
    "runtimeSequence",
    "models",
    "modelVersions",
    "model",
    "diagrams",
    "platformSummary",
  ],
  stopRuntime: ["runtimeSessions", "runtimeSession", "platformSummary", "audit"],
  submit: ["submissions", "submission", "assignmentSubmissions"],
  feedback: ["submissions", "submission", "assignmentSubmissions"],
  readNotification: ["notifications"],
  readAllNotifications: ["notifications"],
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
    ![
      "analysisJob",
      "analysisJobs",
      "projectAnalysisActivity",
      "projectActivity",
      "adminJobs",
      "runtimeSession",
      "runtimeSessions",
      "runtimeReadSession",
      "runtimeReadSessions",
    ].includes(operation)
  )
    return "";
  const items =
    ["projectAnalysisActivity", "projectActivity"].includes(operation) &&
    data &&
    typeof data === "object" &&
    "items" in data
      ? data.items
      : data;
  const rows = operation === "projectActivity" && Array.isArray(items) ? items.map(item => item && typeof item === "object" && "job" in item ? item.job : null) : items;

  return (Array.isArray(rows) ? rows : [rows])
    .flatMap((value: unknown) => {
      if (!value || typeof value !== "object" || !("id" in value)) return [];
      const statusStr =
        "status" in value && typeof value.status === "string"
          ? value.status.toLowerCase()
          : "executionStatus" in value && typeof value.executionStatus === "string"
            ? value.executionStatus.toLowerCase()
            : "";
      if (
        ![
          "completed",
          "complete",
          "failed",
          "cancelled",
          "terminated",
          "timed-out",
          "timeout",
          "partial",
        ].includes(statusStr)
      )
        return [];
      return [`${String(value.id)}:${statusStr}`];
    })
    .sort()
    .join("|");
}
