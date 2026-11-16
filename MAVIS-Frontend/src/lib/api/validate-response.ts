import { contracts, type Operation, type Response } from "./contracts";
import { ApiError } from "@/lib/errors/api-error";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Shape validation alone cannot prevent a service returning another project's
// model or another submission's snapshot for an otherwise valid request.
export function validateResponse<K extends Operation>(
  operation: K,
  input: unknown,
  body: unknown,
): Response<K> {
  const request: Record<string, unknown> = contracts[operation].input.parse(input);
  const parsed = contracts[operation].output.safeParse(body);
  if (!parsed.success) throw new ApiError("contract");
  const value: unknown = parsed.data;
  const fail = () => {
    throw new ApiError("contract");
  };
  const ids: Partial<Record<Operation, string>> = {
    project: "projectId",
    model: "modelId",
    analysisJob: "jobId",
    runtimeSession: "sessionId",
    runtimeReadSession: "sessionId",
    runtimeStop: "sessionId",
    runtimeApprove: "sessionId",
    stopRuntime: "sessionId",
    submission: "submissionId",
    feedback: "submissionId",
    saveScenario: "scenarioId",
    setAccountLock: "accountId",
    setAccountRole: "accountId",
    configureIntegration: "integrationId",
    configureProfile: "profileId",
  };
  const idKey = ids[operation];
  if (operation === "assignmentSubmissions" && Array.isArray(value) && value.some(v => !record(v) || v["assignmentId"] !== request["assignmentId"])) fail();
  if (idKey && (!record(value) || value["id"] !== request[idKey])) fail();
  if (
    Array.isArray(value) &&
    [
      "snapshots",
      "models",
      "modelVersions",
      "analysisJobs",
      "scenarios",
      "runtimeSessions",
      "runtimeReadSessions",
    ].includes(operation) &&
    request["projectId"] !== "*" &&
    value.some((entry: unknown) => !record(entry) || entry["projectId"] !== request["projectId"])
  )
    fail();
  if (
    Array.isArray(value) &&
    ["assignments", "referenceVersions"].includes(operation) &&
    value.some((v) => !record(v) || v["workspaceId"] !== request["workspaceId"])
  )
    fail();
  if (record(value)) {
    for (const key of [
      "projectId",
      "workspaceId",
      "assignmentId",
      "snapshotId",
      "scenarioId",
      "modelId",
      "viewId",
      "elementId",
      "targetId",
      "configurationRevision",
      "scenarioRevision",
    ]) {
      if (
        Object.hasOwn(request, key) &&
        request[key] !== undefined &&
        request[key] !== null &&
        Object.hasOwn(value, key) &&
        value[key] !== undefined &&
        value[key] !== null &&
        request[key] !== value[key]
      )
        fail();
    }
    if (
      [
        "saveArchitectureDocument",
        "configureIntegration",
        "configureProfile",
        "saveRuntimeConfiguration",
        "saveScenario",
      ].includes(operation) &&
      value["revision"] !== Number(request["expectedRevision"]) + 1
    )
      fail();
    if (
      operation === "saveModel" &&
      (value["id"] === request["modelId"] ||
        typeof value["revision"] !== "number" ||
        typeof request["expectedRevision"] !== "number" ||
        value["revision"] <= request["expectedRevision"])
    )
      fail();
    if (
      ["submit", "feedback"].includes(operation) &&
      (!record(value["model"]) || value["model"]["id"] !== request["modelId"])
    )
      fail();
    if (
      operation === "submit" &&
      (!record(value["snapshot"]) ||
        value["snapshot"]["id"] !== request["snapshotId"] ||
        (request["runtimeSessionId"] === null
          ? value["runtime"] !== null
          : !record(value["runtime"]) || value["runtime"]["id"] !== request["runtimeSessionId"]))
    )
      fail();
  }
  return parsed.data as Response<K>;
}
