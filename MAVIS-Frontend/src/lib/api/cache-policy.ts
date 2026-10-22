import type { Operation } from "./contracts";

export const mutationInvalidations: Partial<Record<Operation, readonly Operation[]>> = {
  importSource: ["snapshots"],
  startAnalysis: [
    "analysisJobs",
    "analysisJob",
    "adminJobs",
    "projects",
    "project",
    "platformSummary",
  ],
  saveModel: ["models", "model"],
  saveRuntimeConfiguration: ["runtimeConfiguration"],
  saveScenario: ["scenarios"],
  startRuntime: ["runtimeSessions", "platformSummary"],
  stopRuntime: ["runtimeSessions", "runtimeSession", "platformSummary", "audit"],
  submit: ["submissions", "submission"],
  feedback: ["submissions", "submission"],
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
        !["completed", "failed", "cancelled", "terminated"].includes(String(value.status))
      )
        return [];
      return [`${String(value.id)}:${String(value.status)}`];
    })
    .sort()
    .join("|");
}
