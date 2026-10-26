import type { Operation } from "./contracts";

export const mutationInvalidations: Partial<Record<Operation, readonly Operation[]>> = {
  updateProfile: ["session"],
  createWorkspace: ["workspaces"],
  updateWorkspace: ["workspaces"],
  archiveWorkspace: ["workspaces"],
  addWorkspaceMember: ["workspaces"],
  removeWorkspaceMember: ["workspaces"],
  createAssignment: ["assignments"],
  gradeSubmission:["submissionReview","submissions","submission","assignmentSubmissions"],
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
