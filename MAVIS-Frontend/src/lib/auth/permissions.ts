import type { AppRole } from "@/types/domain";
import type { Operation } from "@/lib/api/contracts";

export type Permission =
  | "project:read"
  | "project:write"
  | "submission:create"
  | "submission:review"
  | "workspace:read"
  | "workspace:manage"
  | "admin:manage";
const grants: Record<AppRole, readonly Permission[]> = {
  student: ["project:read", "project:write", "submission:create", "workspace:read"],
  lecturer: ["workspace:read", "workspace:manage", "submission:review", "project:read"],
  admin: ["admin:manage", "workspace:read", "workspace:manage", "submission:review"],
};
export function hasPermission(role: AppRole | undefined, permission: Permission) {
  return role ? grants[role].includes(permission) : false;
}
export function operationPermission(operation: Operation): Permission | undefined {
  if (
    [
      "accounts",
      "setAccountLock",
      "setAccountRole",
      "integrations",
      "configureIntegration",
      "profiles",
      "configureProfile",
      "audit",
      "adminJobs",
      "platformSummary",
      "adminHealth",
      "adminAiUsage",
    ].includes(operation)
  )
    return "admin:manage";
  if (operation === "feedback") return "submission:review";
  if (operation === "gradeSubmission") return "submission:review";
  if (operation === "submissionReview") return "workspace:read";
  if (["updateFeedback","deleteFeedback"].includes(operation)) return "submission:review";
  if (["updateAssignment","deleteAssignment","batchWorkspaceMembers","publishReference"].includes(operation)) return "workspace:manage";
  if (["workspaceProjects","submissionExport"].includes(operation)) return "workspace:read";
  if (
    [
      "createWorkspace",
      "updateWorkspace",
      "archiveWorkspace",
      "addWorkspaceMember",
      "removeWorkspaceMember",
      "createAssignment",
    ].includes(operation)
  )
    return "workspace:manage";
  if (operation === "assignmentSubmissions") return "submission:review";
  if(operation==="createReferenceProject")return "workspace:manage";
  if (operation === "submit") return "submission:create";
  if (
    ["workspaces", "assignments", "referenceVersions", "submissions", "submission"].includes(
      operation,
    )
  )
    return "workspace:read";
  if (["session", "mockLogin", "signOut"].includes(operation)) return undefined;
  if (
    [
      "importSource",
      "startAnalysis",
      "saveModel",
      "deleteProject",
      "deleteSnapshot",
      "reviewContext",
      "saveRuntimeConfiguration",
      "buildRuntimeSandboxImages",
      "saveScenario",
      "startRuntime",
      "runtimeApprove",
      "explain",
      "freezeArtifacts",
    ].includes(operation)
  )
    return "project:write";
  // Administrative runtime monitoring has its own route and backend checks.
  if (
    [
      "runtimeSessions",
      "runtimeSession",
      "stopRuntime",
      "runtimeReadSessions",
      "runtimeReadSession",
      "runtimeStop",
      "runtimeSequence",
    ].includes(operation)
  )
    return undefined;
  return "project:read";
}
