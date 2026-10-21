import type { AppRole } from "@/types/domain";
import type { Operation } from "@/lib/api/contracts";

export type Permission =
  | "project:read"
  | "project:write"
  | "submission:create"
  | "submission:review"
  | "workspace:read"
  | "admin:manage";
const grants: Record<AppRole, readonly Permission[]> = {
  student: ["project:read", "project:write", "submission:create", "workspace:read"],
  lecturer: ["workspace:read", "submission:review"],
  admin: ["admin:manage"],
};
export function hasPermission(role: AppRole | undefined, permission: Permission) {
  return role ? grants[role].includes(permission) : false;
}
export function operationPermission(operation: Operation): Permission | undefined {
  if (
    [
      "accounts",
      "setAccountLock",
      "integrations",
      "configureIntegration",
      "profiles",
      "configureProfile",
      "audit",
      "adminJobs",
      "platformSummary",
    ].includes(operation)
  )
    return "admin:manage";
  if (operation === "feedback") return "submission:review";
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
      "saveRuntimeConfiguration",
      "saveScenario",
      "startRuntime",
      "explain",
    ].includes(operation)
  )
    return "project:write";
  // Administrative runtime monitoring has its own route and backend checks.
  if (["runtimeSessions", "runtimeSession", "stopRuntime"].includes(operation)) return undefined;
  return "project:read";
}
