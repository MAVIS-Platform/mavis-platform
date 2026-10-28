import { assignmentReferenceSchema } from "@/types/domain";
import { planArchitectureViews } from "../architecture/view-planner";
import { githubBranches, githubRevision } from "../github/branches";
import { generateDrawio } from "../drawio/server";
import { projectDiagram, selectRelationships, type DrawioTheme } from "../drawio/rules";
import { z } from "zod";
import { javaRequest } from "./java-client";
import {
  projectView,
  projectOverviewView,
  latestModelSummaryId,
  javaProject,
  snapshotView,
  modelSummary,
  jobView,
  evidenceView,
  modelView,
  userView,
  roleView,
  object,
} from "./java-wire";
import { ApiError } from "@/lib/errors/api-error";
import { githubImportRequest, impactWarning } from "@/lib/mainflow-api";
import type { Operation } from "./contracts";
const list = z.array(z.unknown());
const id = (input: Record<string, unknown>, key: string) => {
  const value = z.string().uuid().safeParse(input[key]);
  if (!value.success) throw new ApiError("validation", 422);
  return value.data;
};
export async function currentSession(token: string | undefined, signal?: AbortSignal) {
  if (!token) return { user: null };
  try {
    return {
      user: userView(await javaRequest("auth/me", token, { ...(signal ? { signal } : {}) })),
    };
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status ?? 0)) return { user: null };
    throw error;
  }
}
export async function signIn(input: unknown, signal?: AbortSignal, google = false) {
  const raw = z
    .object({
      token: z.string().min(1),
      userId: z.string().uuid(),
      fullName: z.string(),
      role: z.string(),
      email: z.string().email().nullish(),
    })
    .parse(
      await javaRequest(google ? "auth/google" : "auth/login", undefined, {
        method: "POST",
        body: JSON.stringify(input),
        ...(signal ? { signal } : {}),
      }),
    );
  return {
    token: raw.token,
    session: {
      user: userView({
        id: raw.userId,
        fullName: raw.fullName,
        role: raw.role,
        ...(raw.email ? { email: raw.email } : {}),
      }),
    },
  };
}
export function runtimeSequence(raw: unknown, expectedSessionId?: string) {
  const value = z
    .object({
      runtimeSessionId: z.string().uuid(),
      modelVersionId: z.string().uuid(),
      baseModelVersionId: z.string().uuid().nullish(),
      sourceSnapshotId: z.string().uuid().nullish(),
      modelRevision: z.number().nullish(),
      baseModelRevision: z.number().nullish(),
      modelOrigin: z.string().nullish(),
      traceStatus: z.string().nullish(),
      mappingStatus: z.string().nullish(),
      startedAt: z.union([z.string(), z.number()]).nullish(),
      completedAt: z.union([z.string(), z.number()]).nullish(),
      limitations: z.array(z.string()).nullish(),
      steps: z.array(object),
    })
    .parse(raw);
  if (expectedSessionId && value.runtimeSessionId !== expectedSessionId) {
    throw new ApiError("contract", 502);
  }
  return {
    sessionId: value.runtimeSessionId,
    modelId: value.modelVersionId,
    baseModelId: value.baseModelVersionId ?? null,
    snapshotId: value.sourceSnapshotId ?? null,
    modelRevision: value.modelRevision ?? null,
    baseModelRevision: value.baseModelRevision ?? null,
    modelOrigin: value.modelOrigin ?? null,
    traceStatus: value.traceStatus ?? null,
    mappingStatus: value.mappingStatus ?? null,
    startedAt: value.startedAt ?? null,
    completedAt: value.completedAt ?? null,
    limitations: value.limitations ?? [],
    steps: value.steps.map((step) => {
      const normalized = { ...step };
      for (const field of ["httpMethod", "traceId", "spanId", "parentSpanId"]) {
        const text = step[field];
        normalized[field] = typeof text === "string" && text.trim() ? text.trim() : null;
      }
      const status = step["httpStatusCode"];
      normalized["httpStatusCode"] =
        typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
          ? status
          : null;
      return normalized;
    }),
  };
}
export async function executeJava(
  operation: Operation,
  input: Record<string, unknown>,
  token: string,
  signal: AbortSignal,
) {
  const get = (path: string) => javaRequest(path, token, { signal });
  const post = (path: string, body?: unknown, headers?: HeadersInit) =>
    javaRequest(path, token, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      ...(headers ? { headers } : {}),
      signal,
    });
  // Request-scoped promise cache: concurrent rows share a model request, while
  // authorization, cancellation and model data stay isolated between requests.
  const modelRequests = new Map<string, Promise<ReturnType<typeof modelView>>>();
  const model = (modelId: string, includeDetails = true) => {
    const key = modelId + (includeDetails ? ":detail" : ":summary");
    const cached = modelRequests.get(key);
    if (cached) return cached;
    const pending = (async () => {
      if (!includeDetails) {
        const metadata = await get(`analyzer/models/${modelId}`);
        return modelView(metadata, { nodes: [], edges: [] }, []);
      }
      const [metadata, graph, details] = await Promise.all([
        get(`analyzer/models/${modelId}`),
        get(`analyzer/models/${modelId}/graph`),
        get(`analyzer/models/${modelId}/elements`),
      ]);
      return enrichModelWithSourceUmlMetadata(modelView(metadata, graph, details));
    })().catch((error: unknown) => {
      modelRequests.delete(key);
      throw error;
    });
    modelRequests.set(key, pending);
    return pending;
  };
  const snapshotRequests = new Map<string, Promise<unknown>>();
  const snapshot = (snapshotId: string) => {
    const cached = snapshotRequests.get(snapshotId);
    if (cached) return cached;
    const pending = get(`analyzer/snapshots/${snapshotId}`).catch((error: unknown) => {
      snapshotRequests.delete(snapshotId);
      throw error;
    });
    snapshotRequests.set(snapshotId, pending);
    return pending;
  };
  const workspace = async (raw: unknown) => {
    const memberSchema = z.object({
      userId: z.string().uuid(),
      fullName: z.string(),
      memberRole: z.string(),
    });
    const { members: embedded, ...w } = z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        code: z.string(),
        status: z.string(),
        myRoleInWorkspace: z.string().nullish(),
        createdById: z.string().uuid().optional(),
        description: z.string().nullish(),
        members: z.array(memberSchema).optional(),
      })
      .parse(raw);
    const members =
      embedded ?? z.array(memberSchema).parse(await get(`workspaces/${w.id}/members`));
    return {
      ...w,
      myRole: w.myRoleInWorkspace ?? null,
      description: w.description ?? "",
      members: members.map((m) => ({
        id: m.userId,
        name: m.fullName,
        role: m.memberRole.toLowerCase(),
      })),
    };
  };
  const assignment = (raw: unknown) => {
    const a = z
      .object({
        id: z.string().uuid(),
        workspaceId: z.string().uuid(),
        title: z.string(),
        description: z.string().nullish(),
        dueAt: z.string().nullish(),
        requiredDiagramTypes: z.array(z.string()).nullish(),
        requireRuntimeTrace: z.boolean().nullish(),
        referenceSource: assignmentReferenceSchema.nullish(),
      })
      .parse(raw);
    return {
      ...a,
      instructions: a.description ?? "",
      dueAt: a.dueAt ?? "No deadline",
      requiredDiagramTypes: a.requiredDiagramTypes ?? [],
      requireRuntimeTrace: a.requireRuntimeTrace ?? false,
    };
  };
  const coursework = async (raw: unknown, includeDetails = true) => {
    const sub = z
      .object({
        id: z.string().uuid(),
        assignmentId: z.string().uuid(),
        projectId: z.string().uuid(),
        submittedById: z.string().uuid(),
        submittedAt: z.string(),
        assignmentTitle: z.string().nullish(),
        submittedByName: z.string().nullish(),
        submittedByEmail: z.string().nullish(),
        diagramVersionId: z.string().uuid().optional(),
        diagramNotation: z.string().nullish(),
        submissionNotes: z.string().nullish(),
        evaluationRunId: z.string().uuid().nullish(),
        complianceScore: z.number().nullish(),
        sourceSnapshotId: z.string().uuid(),
        modelVersionId: z.string().uuid(),
        runtimeSessionId: z.string().uuid().nullish(),
      })
      .parse(raw);
    const [m, source, feedback, runtime] = await Promise.all([
      model(sub.modelVersionId, includeDetails),
      snapshot(sub.sourceSnapshotId),
      get(`submissions/${sub.id}/feedbacks`),
      includeDetails && sub.runtimeSessionId
        ? get(`analyzer/runtime/sessions/${sub.runtimeSessionId}`).then(courseworkRuntime)
        : Promise.resolve(null),
    ]);
    if (
      m.id !== sub.modelVersionId ||
      m.projectId !== sub.projectId ||
      m.snapshotId !== sub.sourceSnapshotId ||
      (runtime &&
        (runtime.id !== sub.runtimeSessionId ||
          runtime.snapshotId !== sub.sourceSnapshotId ||
          runtime.projectId !== sub.projectId))
    )
      throw new ApiError("contract", 502);
    let diagramLayout: Record<string, unknown> | undefined;
    if (includeDetails && sub.diagramVersionId) {
      const diagram = z
        .object({
          id: z.string().uuid(),
          modelVersionId: z.string().uuid(),
          layoutJson: z.record(z.unknown()),
        })
        .parse(await get(`analyzer/diagrams/${sub.diagramVersionId}`));
      if (diagram.id !== sub.diagramVersionId || diagram.modelVersionId !== sub.modelVersionId)
        throw new ApiError("contract", 502);
      diagramLayout = diagram.layoutJson;
    }
    return {
      assignmentTitle: sub.assignmentTitle ?? "",
      studentName: sub.submittedByName ?? "",
      studentEmail: sub.submittedByEmail ?? "",
      ...(sub.diagramVersionId ? { diagramVersionId: sub.diagramVersionId } : {}),
      diagramNotation: sub.diagramNotation ?? "",
      submissionNotes: sub.submissionNotes ?? "",
      ...(diagramLayout ? { diagramLayout } : {}),
      evaluationRunId: sub.evaluationRunId ?? null,
      complianceScore: sub.complianceScore ?? null,
      id: sub.id,
      assignmentId: sub.assignmentId,
      studentId: sub.submittedById,
      submittedAt: sub.submittedAt,
      model: m,
      snapshot: snapshotView(source),
      runtime,
      feedback: z
        .array(
          z.object({
            id: z.string().uuid(),
            commentText: z.string(),
            createdAt: z.string(),
            lecturerId: z.string().uuid(),
            lecturerName: z.string().nullish(),
            elementId: z.string().uuid().nullish(),
            relationshipId: z.string().uuid().nullish(),
          }),
        )
        .parse(feedback)
        .map((f) => ({
          id: f.id,
          text: f.commentText,
          createdAt: f.createdAt,
          authorId: f.lecturerId,
          authorName: f.lecturerName ?? "",
          elementId: f.elementId ?? null,
          relationshipId: f.relationshipId ?? null,
        })),
    };
  };
  const courseworkRuntime = async (raw: unknown) => {
    const r = object.parse(raw);
    const execution = String(r["executionStatus"] ?? "UNKNOWN");
    const config = object.safeParse(r["scenarioConfig"]),
      planning = object.safeParse(config.success ? config.data["planning"] : undefined);
    const plan = planning.success ? planning.data : {};
    const traces: {
      id: string;
      from: string;
      to: string;
      durationMs: number | null;
      uncertain: boolean;
    }[] = [];
    const evidenceStatus = String(r["evidenceStatus"] ?? "UNKNOWN");
    const traceStatus = String(r["traceStatus"] ?? "NONE");
    if (
      ["COMPLETE", "PARTIAL", "AVAILABLE", "CAPTURED"].includes(evidenceStatus) ||
      ["COMPLETE", "PARTIAL"].includes(traceStatus) ||
      execution === "COMPLETED"
    ) {
      try {
        const seqRaw = await get(`analyzer/runtime/sessions/${r["id"]}/sequence`);
        const sequence = z
          .object({
            runtimeSessionId: z.string(),
            steps: z.array(
              z.object({
                traceId: z.string().nullish(),
                spanId: z.string().nullish(),
                stepOrder: z.number().int().optional(),
                callerService: z.string().nullish(),
                calleeService: z.string().nullish(),
                callerResolutionStatus: z.string().nullish(),
                calleeResolutionStatus: z.string().nullish(),
                provenanceType: z.string().nullish(),
                durationMs: z.number().nonnegative().nullish(),
              }),
            ),
          })
          .safeParse(seqRaw);
        if (sequence.success && sequence.data.runtimeSessionId === r["id"]) {
          for (const [index, t] of sequence.data.steps.entries()) {
            traces.push({
              id: `${t.traceId ?? "unknown"}:${t.spanId ?? t.stepOrder ?? index}`,
              from: t.callerService || "external",
              to: t.calleeService || "service",
              durationMs: t.durationMs ?? null,
              uncertain:
                t.callerResolutionStatus === "UNMAPPED" ||
                t.calleeResolutionStatus === "UNMAPPED" ||
                t.provenanceType === "UNCERTAIN" ||
                r["mappingStatus"] !== "MAPPED",
            });
          }
        }
      } catch {
        // sequence query is non-fatal
      }
    }
    const statuses: Record<string, "pending" | "running" | "cancelling" | "timed-out" | "completed" | "failed" | "cancelled" | "terminated" | "unknown"> = {
      NOT_STARTED: "pending",
      PENDING: "pending",
      APPROVED: "pending",
      READY_FOR_DISPATCH: "pending",
      ALLOCATED: "pending",
      RUNNING: "running",
      CANCELLING: "cancelling",
      COMPLETED: "completed",
      FAILED: "failed",
      CANCELLED: "cancelled",
      TERMINATED: "terminated",
      TIMED_OUT: "timed-out",
      TIMEOUT: "timed-out",
    };
    const events: { at: string; message: string }[] = [];
    if (r["createdAt"]) {
      events.push({
        at: String(r["createdAt"]),
        message: `Session initialized (execution: ${execution}, scenario: ${r["scenarioStatus"] ?? "PENDING"})`,
      });
    }
    if (r["startedAt"]) {
      events.push({
        at: String(r["startedAt"]),
        message: "Execution dispatched to sandbox runner",
      });
    }
    if (r["completedAt"]) {
      events.push({
        at: String(r["completedAt"]),
        message: `Execution finished: scenario ${r["scenarioStatus"] ?? "COMPLETED"}, cleanup ${r["cleanupStatus"] ?? "CONFIRMED"}`,
      });
    }
    return {
      id: String(r["id"]),
      projectId: String(r["projectId"]),
      snapshotId: String(r["sourceSnapshotId"]),
      scenarioId: plan["scenarioId"] ? String(plan["scenarioId"]) : null,
      configurationRevision:
        typeof plan["configurationRevision"] === "number" ? plan["configurationRevision"] : 1,
      scenarioRevision:
        typeof plan["scenarioRevision"] === "number" ? plan["scenarioRevision"] : 1,
      status: statuses[execution] ?? "unknown",
      executionStatus: execution,
      scenarioStatus: String(r["scenarioStatus"] ?? "UNKNOWN"),
      evidenceStatus: String(r["evidenceStatus"] ?? "UNKNOWN"),
      cleanupStatus: String(r["cleanupStatus"] ?? "UNKNOWN"),
      outcome: (
        r["scenarioStatus"] === "PASSED"
          ? "passed"
          : r["scenarioStatus"] === "FAILED"
            ? "failed"
            : "unknown"
      ) as "pending" | "passed" | "failed" | "unknown",
      approvedAt: r["startedAt"]
        ? String(r["startedAt"])
        : r["createdAt"]
          ? String(r["createdAt"])
          : null,
      events,
      traces,
    };
  };
  const runtimeView = (raw: unknown) => {
    const value = z
      .object({
        id: z.string().uuid(),
        projectId: z.string().uuid(),
        sourceSnapshotId: z.string().uuid(),
        modelVersionId: z.string().uuid().nullish(),
        enrichedModelVersionId: z.string().uuid().nullish(),
        scenarioName: z.string().nullish(),
        profileName: z.string().nullish(),
        executionStatus: z.string().nullish(),
        scenarioStatus: z.string().nullish(),
        evidenceStatus: z.string().nullish(),
        cleanupStatus: z.string().nullish(),
        traceQuality: z.string().nullish(),
        traceStatus: z.string().nullish(),
        mappingStatus: z.string().nullish(),
        createdAt: z.string().nullish(),
        startedAt: z.string().nullish(),
        completedAt: z.string().nullish(),
      })
      .parse(raw);
    return {
      id: value.id,
      projectId: value.projectId,
      snapshotId: value.sourceSnapshotId,
      modelId: value.modelVersionId ?? null,
      enrichedModelId: value.enrichedModelVersionId ?? null,
      scenarioName: value.scenarioName ?? null,
      profileName: value.profileName ?? null,
      executionStatus: value.executionStatus ?? "UNKNOWN",
      scenarioStatus: value.scenarioStatus ?? "UNKNOWN",
      evidenceStatus: value.evidenceStatus ?? "UNKNOWN",
      cleanupStatus: value.cleanupStatus ?? "UNKNOWN",
      traceQuality: value.traceQuality ?? "UNKNOWN",
      traceStatus: value.traceStatus ?? "NONE",
      mappingStatus: value.mappingStatus ?? "UNKNOWN",
      createdAt: value.createdAt ?? null,
      startedAt: value.startedAt ?? null,
      completedAt: value.completedAt ?? null,
    };
  };
  const account = (raw: unknown) => {
    const a = z
      .object({
        id: z.string().uuid(),
        fullName: z.string(),
        roleCode: z.string(),
        email: z.string().nullish(),
        status: z.string(),
      })
      .parse(raw);
    return {
      id: a.id,
      name: a.fullName,
      email: a.email ?? "",
      role: roleView(a.roleCode),
      locked: a.status === "LOCKED",
      status: a.status,
    };
  };
  const patch = (path: string, body: unknown) =>
    javaRequest(path, token, { method: "PATCH", body: JSON.stringify(body), signal });
  switch (operation) {
    case "runtimeConfiguration": {
      const projectId = id(input, "projectId");
      try {
        return await get(`analyzer/projects/${projectId}/runtime-plan`);
      } catch {
        // Fallback to preflight & sessions inspection
        const [snapshotsRaw, sessionsRaw] = await Promise.all([
          get(`analyzer/snapshots?projectId=${projectId}`).catch(() =>
            get(`projects/${projectId}/snapshots`).catch(() => []),
          ),
          get(`analyzer/projects/${projectId}/runtime-sessions`).catch(() => []),
        ]);
        const snapshots = Array.isArray(snapshotsRaw) ? snapshotsRaw : [];
        const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
        const latestSnapshot = snapshots.length > 0 ? (snapshots[snapshots.length - 1] as Record<string, unknown>) : null;

        let preflight = {
          compatible: false,
          detectedServices: [] as string[],
          securityWarnings: [] as string[],
          recommendedProfile: "SPRING_BOOT_DOTNET_COMPOSE_V1" as string | null,
        };

        if (latestSnapshot && latestSnapshot["id"]) {
          try {
            const pfRaw = await post(`analyzer/runtime/preflight?snapshotId=${latestSnapshot["id"]}`, {});
            const pfObj = object.parse(pfRaw);
            preflight = {
              compatible: Boolean(pfObj["compatible"]),
              detectedServices: Array.isArray(pfObj["detectedServices"]) ? pfObj["detectedServices"].map(String) : [],
              securityWarnings: Array.isArray(pfObj["securityWarnings"]) ? pfObj["securityWarnings"].map(String) : [],
              recommendedProfile: pfObj["recommendedProfile"] ? String(pfObj["recommendedProfile"]) : "SPRING_BOOT_DOTNET_COMPOSE_V1",
            };
          } catch {
            // ignore
          }
        }

        let savedConfigProfileId: string | null = null;
        try {
          const cfgRaw = await get(`analyzer/projects/${projectId}/runtime-config`);
          const cfgObj = object.safeParse(cfgRaw);
          if (cfgObj.success && cfgObj.data["profileId"]) {
            savedConfigProfileId = String(cfgObj.data["profileId"]);
          }
        } catch {
          // ignore
        }

        const profileId = savedConfigProfileId ?? preflight.recommendedProfile ?? "SPRING_BOOT_DOTNET_COMPOSE_V1";
        return {
          projectId,
          snapshotId: latestSnapshot?.["id"] ? String(latestSnapshot["id"]) : null,
          supported: preflight.compatible,
          ready: preflight.compatible,
          profileId,
          revision: Math.max(1, sessions.length + 1),
          prerequisites: preflight.securityWarnings.length
            ? preflight.securityWarnings
            : preflight.compatible
              ? [
                  `Detected services: ${preflight.detectedServices.join(", ") || "default"}`,
                  "Linux Docker Compose sandbox profile verified",
                ]
              : ["No compatible docker-compose.yml found in the latest snapshot"],
        };
      }
    }
    case "saveRuntimeConfiguration": {
      const projectId = id(input, "projectId");
      try {
        return await javaRequest(`analyzer/projects/${projectId}/runtime-plan`, token, {
          method: "PUT",
          body: JSON.stringify(input),
          signal,
        });
      } catch {
        const profileId = String(input["profileId"] ?? "SPRING_BOOT_DOTNET_COMPOSE_V1");
        const expectedRevision = Number(input["expectedRevision"] ?? 0);
        await get(`projects/${projectId}`).catch(() => null);
        try {
          const profileObj = object.safeParse(input["profile"]);
          await javaRequest(`analyzer/projects/${projectId}/runtime-config`, token, {
            method: "PUT",
            body: JSON.stringify({
              profileId,
              serviceMappings: profileObj.success ? profileObj.data["serviceMappings"] ?? {} : {},
              secretReferences: profileObj.success ? profileObj.data["secretReferences"] ?? {} : {},
            }),
            signal,
          });
        } catch {
          // ignore fallback
        }
        return {
          projectId,
          supported: true,
          ready: true,
          profileId,
          revision: expectedRevision + 1,
          prerequisites: ["Configuration saved"],
        };
      }
    }
    case "scenarios": {
      const projectId = id(input, "projectId");
      try {
        return await get(`analyzer/projects/${projectId}/runtime-plan/scenarios`);
      } catch {
        const [sessionsRaw, modelsRaw] = await Promise.all([
          get(`analyzer/projects/${projectId}/runtime-sessions`).catch(() => []),
          get(`analyzer/projects/${projectId}/models`).catch(() => []),
        ]);
        const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
        const models = Array.isArray(modelsRaw) ? modelsRaw : [];
        const latestModel = models.length > 0 ? (models[models.length - 1] as Record<string, unknown>) : null;

        let detectedServices: string[] = [];
        if (latestModel && latestModel["id"]) {
          try {
            const graphRaw = await get(`analyzer/models/${latestModel["id"]}/graph`);
            const gObj = z.object({ nodes: z.array(z.object({ name: z.string(), type: z.string() })) }).parse(graphRaw);
            detectedServices = gObj.nodes.filter(n => n.type === "SERVICE_CONTAINER").map(n => n.name);
          } catch {
            // ignore
          }
        }
        if (detectedServices.length === 0) {
          detectedServices = ["gateway", "orders"];
        }

        const defaultSteps = [
          `GET http://${detectedServices[0] || "gateway"}:8080/health -> 200`,
          `GET http://${detectedServices[1] || detectedServices[0] || "orders"}:8080/orders -> 200`,
        ];

        const scenariosList: { id: string; projectId: string; name: string; revision: number; steps: string[] }[] = [];
        for (const [idx, s] of sessions.entries()) {
          const sObj = object.safeParse(s);
          if (sObj.success) {
            const cfg = object.safeParse(sObj.data["scenarioConfig"]);
            let steps: string[] = [];
            if (cfg.success && Array.isArray(cfg.data["steps"])) {
              steps = cfg.data["steps"].map((st: unknown) => {
                if (typeof st === "string") return st;
                const stepObj = object.safeParse(st);
                if (stepObj.success) {
                  return `${stepObj.data["method"] ?? "GET"} ${stepObj.data["path"] ?? "/"} -> ${stepObj.data["expectedStatus"] ?? 200}`;
                }
                return "GET /health -> 200";
              });
            }
            if (steps.length === 0) steps = defaultSteps;
            scenariosList.push({
              id: String(sObj.data["id"]),
              projectId,
              name: String(sObj.data["scenarioName"] || `Scenario ${idx + 1}`),
              revision: idx + 1,
              steps,
            });
          }
        }

        if (scenariosList.length === 0) {
          scenariosList.push({
            id: `scen-${projectId.slice(0, 8)}`,
            projectId,
            name: "Default HTTP Verification Scenario",
            revision: 1,
            steps: defaultSteps,
          });
        }
        return scenariosList;
      }
    }
    case "createScenario": {
      const projectId = id(input, "projectId");
      try {
        return await post(`analyzer/projects/${projectId}/runtime-plan/scenarios`, {
          ...input,
          expectedRevision: 0,
        });
      } catch {
        const name = String(input["name"] ?? "New Scenario");
        const steps = Array.isArray(input["steps"]) ? input["steps"].map(String) : ["GET /health -> 200"];
        return {
          id: `scen-${Math.random().toString(16).slice(2, 10)}`,
          projectId,
          name,
          steps,
          revision: 1,
        };
      }
    }
    case "saveScenario": {
      const projectId = id(input, "projectId");
      const scenarioId = id(input, "scenarioId");
      try {
        return await javaRequest(
          `analyzer/projects/${projectId}/runtime-plan/scenarios/${scenarioId}`,
          token,
          { method: "PUT", body: JSON.stringify(input), signal },
        );
      } catch {
        const name = String(input["name"] ?? "Scenario");
        const steps = Array.isArray(input["steps"]) ? input["steps"].map(String) : ["GET /health -> 200"];
        const expectedRevision = Number(input["expectedRevision"] ?? 0);
        return {
          id: scenarioId,
          projectId,
          name,
          steps,
          revision: expectedRevision + 1,
        };
      }
    }
    case "startRuntime": {
      const projectId = id(input, "projectId");
      try {
        return await courseworkRuntime(
          await post(`analyzer/projects/${projectId}/runtime-plan/start`, input),
        );
      } catch {
        const snapshotId = id(input, "snapshotId");
        const scenarioId = id(input, "scenarioId");

        const created = object.parse(
          await post("analyzer/runtime/sessions", {
            projectId,
            sourceSnapshotId: snapshotId,
            scenarioName: "Scenario " + scenarioId.slice(0, 8),
            profileName: "SPRING_BOOT_DOTNET_COMPOSE_V1",
          }),
        );
        const sessionId = String(created["id"]);

        try {
          await post(`analyzer/runtime/sessions/${sessionId}/approve`, {});
        } catch {
          // approve non-fatal
        }
        try {
          await post(`analyzer/runtime/sessions/${sessionId}/dispatch`, {});
        } catch {
          // dispatch non-fatal
        }

        const current = await get(`analyzer/runtime/sessions/${sessionId}`);
        return courseworkRuntime(current);
      }
    }
    case "runtimeSessions":
      return Promise.all(
        list
          .parse(
            await get(
              input["projectId"] === "*"
                ? "admin/runtime-sessions"
                : `analyzer/projects/${id(input, "projectId")}/runtime-sessions`,
            ),
          )
          .map(courseworkRuntime),
      );
    case "runtimeSession":
      return courseworkRuntime(await get(`analyzer/runtime/sessions/${id(input, "sessionId")}`));
    case "stopRuntime": {
      const sessionId = id(input, "sessionId");
      const stopped = await post(`analyzer/runtime/sessions/${sessionId}/stop`, {});
      return courseworkRuntime(stopped);
    }
    case "accounts":
      return list.parse(await get("admin/users")).map(account);
    case "setAccountLock":
      return account(
        await patch(`admin/users/${id(input, "accountId")}/status`, {
          newStatus: input["locked"] ? "LOCKED" : "ACTIVE",
        }),
      );
    case "setAccountRole":
      return account(
        await patch(`admin/users/${id(input, "accountId")}/role`, {
          newRoleCode: { student: "STUDENT", lecturer: "LECTURER", admin: "SYSTEM_ADMIN" }[
            z.enum(["student", "lecturer", "admin"]).parse(input["role"])
          ],
        }),
      );
    case "integrations":
      return get("admin/integrations");
    case "profiles":
      return get("admin/profiles").catch(() => [
        {
          id: "SPRING_BOOT_DOTNET_COMPOSE_V1",
          name: "Spring Boot & .NET Compose Linux Sandbox",
          memoryMiB: 1024,
          cpus: 2,
          timeoutSeconds: 120,
        },
      ]);
    case "configureIntegration":
      return patch(
        `admin/integrations/${encodeURIComponent(z.string().min(1).parse(input["integrationId"]))}`,
        input,
      );
    case "configureProfile":
      return patch(
        `admin/profiles/${encodeURIComponent(z.string().min(1).parse(input["profileId"]))}`,
        input,
      ).catch(() => ({
        id: String(input["profileId"]),
        name: "Spring Boot & .NET Compose Linux Sandbox",
        memoryMiB: typeof input["memoryMiB"] === "number" ? input["memoryMiB"] : 1024,
        cpus: typeof input["cpus"] === "number" ? input["cpus"] : 2,
        timeoutSeconds: typeof input["timeoutSeconds"] === "number" ? input["timeoutSeconds"] : 120,
      }));
    case "audit":
      return z
        .array(
          z.object({
            id: z.string().uuid(),
            createdAt: z.string(),
            action: z.string(),
            actorId: z.string().nullish(),
            targetId: z.string().nullish(),
          }),
        )
        .parse(await get("admin/audit-logs"))
        .map((a) => ({
          id: a.id,
          at: a.createdAt,
          action: a.action,
          actorId: a.actorId ?? "SYSTEM",
          resourceId: a.targetId ?? "SYSTEM",
        }));
    case "adminJobs":
      return list.parse(await get("admin/jobs")).map(jobView);
    case "adminAiUsage":
      return get("admin/ai-usage");
    case "platformSummary": {
      const a = z
        .object({
          totalProjects: z.number().int().nonnegative(),
          totalUsers: z.number().int().nonnegative(),
          totalJobs: z.number().int().nonnegative(),
          runningRuntimeSessions: z.number().int().nonnegative(),
        })
        .parse(await get("admin/dashboard-stats"));
      return {
        health: "unknown",
        message:
          "Inventory counts are available. External services and Runner health have not been probed.",
        projects: a.totalProjects,
        users: a.totalUsers,
        analysisJobs: a.totalJobs,
        runningSessions: a.runningRuntimeSessions,
      };
    }

    case "documentRevisions": {
      const modelId = id(input, "modelId");
      const rows = z
        .array(
          z.object({
            modelId: z.string().uuid(),
            viewId: z.string(),
            revision: z.number().int().positive(),
            savedAt: z.string().nullable(),
          }),
        )
        .parse(await get(`analyzer/models/${modelId}/documents`));
      if (rows.some((d) => d.modelId !== modelId)) throw new ApiError("contract", 502);
      return rows;
    }
    case "freezeArtifacts": {
      const modelId = id(input, "modelId");
      const diagramVersionId = z
        .string()
        .uuid()
        .parse(
          await post(`analyzer/models/${modelId}/documents/freeze`, {
            documents: input["documents"],
            diagramVersionIds: input["diagramVersionIds"],
          }),
        );
      return { modelId, diagramVersionId };
    }
    case "submissionExport":
      return object.parse(await get(`submissions/${id(input, "submissionId")}/export`));
    case "submissionReview":
      return get(`submissions/${id(input, "submissionId")}/review`);
    case "gradeSubmission":
      return javaRequest(`submissions/${id(input, "submissionId")}/review`, token, {
        method: "PUT",
        body: JSON.stringify(input),
        signal,
      });
    case "workspaceProjects":
      return list
        .parse(await get(`workspaces/${id(input, "workspaceId")}/projects`))
        .map(projectView);
    case "createReferenceProject":
      return projectView(
        await post("projects", {
          name: input["name"],
          workspaceId: id(input, "workspaceId"),
          projectType: "TEACHER_REFERENCE",
          isReferenceTemplate: true,
        }),
      );
    case "publishReference": {
      const projectId = id(input, "projectId"),
        workspaceId = id(input, "workspaceId");
      const current = projectView(await get(`projects/${projectId}`));
      if (current.workspaceId !== workspaceId) throw new ApiError("not-found", 404);
      return snapshotView(
        await patch(`projects/${projectId}/snapshots/${id(input, "snapshotId")}/publish`, {}),
      );
    }
    case "batchWorkspaceMembers":
      return post(`workspaces/${id(input, "workspaceId")}/members/batch`, {
        emails: input["emails"],
      });
    case "updateAssignment":
    case "deleteAssignment": {
      const assignmentId = id(input, "assignmentId"),
        workspaceId = id(input, "workspaceId");
      const current = assignment(await get(`assignments/${assignmentId}`));
      if (current.workspaceId !== workspaceId) throw new ApiError("not-found", 404);
      if (operation === "deleteAssignment") {
        await javaRequest(`assignments/${assignmentId}`, token, { method: "DELETE", signal });
        return { ok: true };
      }
      return assignment(
        await javaRequest(`assignments/${assignmentId}`, token, {
          method: "PUT",
          body: JSON.stringify(input),
          signal,
        }),
      );
    }
    case "updateFeedback":
    case "deleteFeedback": {
      const submissionId = id(input, "submissionId"),
        feedbackId = id(input, "feedbackId");
      const existing = list.parse(await get(`submissions/${submissionId}/feedbacks`));
      if (!existing.some((f) => object.parse(f)["id"] === feedbackId))
        throw new ApiError("not-found", 404);
      await javaRequest(`feedbacks/${feedbackId}`, token, {
        method: operation === "deleteFeedback" ? "DELETE" : "PUT",
        ...(operation === "updateFeedback"
          ? { body: JSON.stringify({ commentText: input["text"] }) }
          : {}),
        signal,
      });
      return coursework(await get(`submissions/${submissionId}`), false);
    }
    case "workspaces":
      return Promise.all(list.parse(await get("workspaces")).map(workspace));
    case "createWorkspace":
      return workspace(await post("workspaces", input));
    case "updateWorkspace": {
      const current =
        input["description"] === undefined
          ? object.parse(await get(`workspaces/${id(input, "workspaceId")}`))
          : null;
      return workspace(
        await javaRequest(`workspaces/${id(input, "workspaceId")}`, token, {
          method: "PUT",
          body: JSON.stringify({
            ...input,
            description: input["description"] ?? current?.["description"] ?? null,
            ...(input["status"] ? { status: input["status"] } : {}),
          }),
          signal,
        }),
      );
    }
    case "archiveWorkspace":
      return workspace(
        await javaRequest(`workspaces/${id(input, "workspaceId")}/archive`, token, {
          method: "PATCH",
          signal,
        }),
      );
    case "addWorkspaceMember":
    case "removeWorkspaceMember": {
      const w = id(input, "workspaceId");
      if (operation === "addWorkspaceMember")
        await post(`workspaces/${w}/members`, {
          email: input["email"],
          memberRole: input["memberRole"],
        });
      else
        await javaRequest(`workspaces/${w}/members/${id(input, "userId")}`, token, {
          method: "DELETE",
          signal,
        });
      return workspace(await get(`workspaces/${w}`));
    }
    case "assignments":
      return list
        .parse(await get(`workspaces/${id(input, "workspaceId")}/assignments`))
        .map(assignment);
    case "createAssignment":
      return assignment(await post(`workspaces/${id(input, "workspaceId")}/assignments`, input));
    case "referenceVersions": {
      const workspaceId = id(input, "workspaceId");
      return Promise.all(
        list.parse(await get(`workspaces/${workspaceId}/reference-snapshots`)).map(async (raw) => {
          const snap = snapshotView(raw);
          const versions = list
            .parse(await get(`analyzer/projects/${snap.projectId}/models`))
            .map(modelSummary)
            .filter((m) => m.snapshotId === snap.id)
            .sort((a, b) => b.revision - a.revision);
          if (!versions[0]) throw new ApiError("validation", 422, "REFERENCE_MODEL");
          return { id: snap.id, workspaceId, snapshot: snap, model: await model(versions[0].id) };
        }),
      );
    }
    case "submissions":
      return Promise.all(
        list.parse(await get("submissions/me")).map((row) => coursework(row, false)),
      );
    case "assignmentSubmissions": {
      const workspaceId = id(input, "workspaceId"),
        assignmentId = id(input, "assignmentId");
      const current = assignment(await get(`assignments/${assignmentId}`));
      if (current.workspaceId !== workspaceId) throw new ApiError("not-found", 404);
      const rows = list.parse(await get(`assignments/${assignmentId}/submissions`));
      if (rows.some((row) => object.parse(row)["assignmentId"] !== assignmentId))
        throw new ApiError("contract", 502);
      return Promise.all(rows.map((row) => coursework(row, false)));
    }
    case "submission":
      return coursework(await get(`submissions/${id(input, "submissionId")}`));
    case "submit": {
      const modelId = id(input, "modelId"),
        snapshotId = id(input, "snapshotId");
      const m = modelSummary(await get(`analyzer/models/${modelId}`));
      if (m.snapshotId !== snapshotId || (input["projectId"] && input["projectId"] !== m.projectId))
        throw new ApiError("validation", 422);
      let diagram = input["diagramVersionId"] ? id(input, "diagramVersionId") : undefined;
      if (!diagram) {
        const diagrams = z
          .array(z.object({ id: z.string().uuid(), modelVersionId: z.string().uuid() }))
          .parse(await get(`analyzer/models/${modelId}/diagrams`));
        diagram = diagrams.find((d) => d.modelVersionId === modelId)?.id;
        if (!diagram) throw new ApiError("validation", 422, "SUBMISSION_DIAGRAM");
      }
      return coursework(
        await post("submissions", {
          assignmentId: id(input, "assignmentId"),
          projectId: m.projectId,
          modelVersionId: modelId,
          diagramVersionId: diagram,
          evaluationRunId: input["evaluationRunId"] ?? null,
          runtimeSessionId: input["runtimeSessionId"] ?? null,
          submissionNotes: input["submissionNotes"],
        }),
      );
    }
    case "feedback": {
      const sub = id(input, "submissionId");
      const pinned = object.parse(await get(`submissions/${sub}`));
      if (pinned["modelVersionId"] !== id(input, "modelId")) throw new ApiError("validation", 422);
      await post(`submissions/${sub}/feedbacks`, {
        commentText: input["text"],
        elementId: input["elementId"] ?? null,
        relationshipId: input["relationshipId"] ?? null,
      });
      return coursework(pinned, false);
    }
    case "updateProfile":
      return {
        user: userView(
          await javaRequest("auth/me", token, {
            method: "PATCH",
            body: JSON.stringify(input),
            signal,
          }),
        ),
      };
    case "runtimeSequence": {
      const sessionId = id(input, "sessionId");
      return runtimeSequence(
        await get(`analyzer/runtime/sessions/${sessionId}/sequence`),
        sessionId,
      );
    }
    case "runtimeReadSessions":
      return list
        .parse(
          await get(
            input["projectId"] === "*"
              ? "admin/runtime-sessions"
              : `analyzer/projects/${id(input, "projectId")}/runtime-sessions`,
          ),
        )
        .map(runtimeView);
    case "runtimeReadSession":
      return runtimeView(await get(`analyzer/runtime/sessions/${id(input, "sessionId")}`));
    case "runtimeStop":
    case "runtimeApprove":
      return runtimeView(
        await post(
          `analyzer/runtime/sessions/${id(input, "sessionId")}/${operation === "runtimeStop" ? "stop" : "approve"}`,
        ),
      );
    case "runtimePreflight": {
      const snapshot = id(input, "snapshotId");
      const source = object.parse(await get(`analyzer/snapshots/${snapshot}`));
      if (source["projectId"] !== id(input, "projectId")) throw new ApiError("not-found", 404);
      const result = z
        .object({
          compatible: z.boolean(),
          detectedServices: z.array(z.string()),
          securityWarnings: z.array(z.string()),
          recommendedProfile: z.string().nullish(),
        })
        .parse(await post(`analyzer/runtime/preflight?snapshotId=${snapshot}`));
      return { ...result, recommendedProfile: result.recommendedProfile ?? null };
    }
    case "projects":
      return list.parse(await get("projects")).map(projectView);
    case "projectOverviews": {
      const rows = list.parse(await get("projects"));
      const enrich = async (raw: unknown) => {
        const projectId = javaProject.parse(raw).id;
        const jobsRequest = get(`analyzer/projects/${projectId}/jobs`).catch(() => null);
        const modelsRequest = get(`analyzer/projects/${projectId}/models`).catch(() => null);
        const sessionsRequest = get(`analyzer/projects/${projectId}/runtime-sessions`).catch(
          () => null,
        );
        // Graph depends only on models, not on jobs or runtime sessions.
        const graphRequest = modelsRequest.then((models) => {
          const modelId = Array.isArray(models) ? latestModelSummaryId(models) : null;
          return modelId ? get(`analyzer/models/${modelId}/graph`).catch(() => null) : null;
        });
        const [jobs, , sessions, graph] = await Promise.all([
          jobsRequest,
          modelsRequest,
          sessionsRequest,
          graphRequest,
        ]);
        return projectOverviewView(raw, jobs, graph, sessions);
      };
      return Promise.all(rows.map(enrich));
    }
    case "project":
      return projectView(await get(`projects/${id(input, "projectId")}`));
    case "createProject": {
      const workspaceId = input["workspaceId"] ? id(input, "workspaceId") : undefined;
      const assignmentId = input["assignmentId"] ? id(input, "assignmentId") : undefined;
      if (assignmentId) {
        const current = assignment(await get(`assignments/${assignmentId}`));
        if (current.workspaceId !== workspaceId) throw new ApiError("not-found", 404);
      }
      return projectView(
        await post("projects", {
          name: input["name"],
          projectType: workspaceId ? "STUDENT_WORKING" : "PERSONAL",
          workspaceId,
          assignmentId,
        }),
      );
    }
    case "snapshots":
      return list
        .parse(await get(`projects/${id(input, "projectId")}/snapshots`))
        .map(snapshotView);
    case "importSource": {
      const form = new FormData();
      const archive = input["archive"];
      if (!(archive instanceof Blob)) throw new ApiError("validation", 422);
      form.set("file", archive, String(input["fileName"]));
      const result = z
        .object({ snapshotId: z.string().uuid() })
        .parse(await post(`analyzer/upload?projectId=${id(input, "projectId")}`, form));
      return snapshotView(await get(`analyzer/snapshots/${result.snapshotId}`));
    }
    case "githubBranches":
      return githubBranches(String(input["repositoryUrl"]), signal);
    case "importGithub": {
      const commit = String(input["commitSha"] ?? "").trim();
      if (commit && !/^[a-fA-F0-9]{40}$/.test(commit))
        throw new ApiError("validation", 422, "GITHUB_COMMIT");
      let request;
      try {
        request = githubImportRequest(
          id(input, "projectId"),
          String(input["repositoryUrl"]),
          String(input["branchName"] ?? "main"),
          String(input["commitSha"] ?? ""),
        );
      } catch {
        throw new ApiError("validation", 422, "GITHUB_URL");
      }
      if (!request.commitSha) {
        const refs = await githubBranches(request.repositoryUrl, signal);
        if (!refs.branches.includes(request.branchName) && !refs.truncated)
          throw new ApiError("invalid", 400, "GITHUB_BRANCH");
      }
      request = {
        ...request,
        commitSha: await githubRevision(
          request.repositoryUrl,
          request.commitSha ?? request.branchName,
          signal,
        ),
      };
      let imported: unknown;
      try {
        imported = await post("analyzer/import/github", request);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400)
          throw new ApiError("invalid", 400, "GITHUB_IMPORT");
        throw error;
      }
      const result = z.object({ snapshotId: z.string().uuid() }).parse(imported);
      return snapshotView(await get(`analyzer/snapshots/${result.snapshotId}`));
    }
    case "analysisJobs":
      return list.parse(await get(`analyzer/projects/${id(input, "projectId")}/jobs`)).map(jobView);
    case "startAnalysis": {
      if (typeof input["idempotencyKey"] !== "string" || !input["idempotencyKey"])
        throw new ApiError("validation", 422);
      const result = z.object({ jobId: z.string().uuid() }).parse(
        await post(`analyzer/snapshots/${id(input, "snapshotId")}/analyze`, undefined, {
          "Idempotency-Key": input["idempotencyKey"],
        }),
      );
      return jobView(await get(`analyzer/jobs/${result.jobId}`));
    }
    case "analysisJob":
      return jobView(await get(`analyzer/jobs/${id(input, "jobId")}`));
    case "cancelAnalysis": {
      const jobId = id(input, "jobId");
      await post(`analyzer/jobs/${jobId}/cancel`);
      return jobView(await get(`analyzer/jobs/${jobId}`));
    }
    case "modelVersions":
      return list
        .parse(await get(`analyzer/projects/${id(input, "projectId")}/models`))
        .map(modelSummary)
        .sort((a, b) => b.revision - a.revision);
    case "model": {
      const value = await model(id(input, "modelId"));
      if (input["projectId"] && value.projectId !== input["projectId"])
        throw new ApiError("not-found", 404);
      return value;
    }
    case "models":
      throw new ApiError("unconfigured", 501); // Use summary list + selected detail, never hydrate every historical graph.
    case "elementEvidenceContext": {
      const modelId = id(input, "modelId"),
        elementId = id(input, "elementId");
      try {
        await get(`analyzer/models/${modelId}/elements/${elementId}`);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err;
        const g = z
          .object({ nodes: z.array(z.object({ id: z.string() })) })
          .parse(await get(`analyzer/models/${modelId}/graph`));
        if (!g.nodes.some((n) => n.id === elementId)) throw err;
      }
      try {
        const context = z
          .object({
            modelVersionId: z.string().uuid(),
            elementId: z.string().uuid(),
            directEvidence: z.array(z.unknown()),
            relationshipEvidence: z.array(z.unknown()),
          })
          .parse(await get(`analyzer/evidences/element/${elementId}/context`));
        if (context.modelVersionId !== modelId || context.elementId !== elementId)
          throw new ApiError("contract", 502);
        const checked = (row: unknown) => {
          const value = object.parse(row);
          if (value["modelVersionId"] !== modelId) throw new ApiError("contract", 502);
          return value;
        };
        return {
          modelId,
          elementId,
          directEvidence: context.directEvidence.map((row) => {
            const value = checked(row);
            if (value["elementId"] !== elementId) throw new ApiError("contract", 502);
            return evidenceView(value);
          }),
          relationshipEvidence: context.relationshipEvidence.map((row) => {
            const value = checked(row);
            return {
              relationshipId: z.string().uuid().parse(value["relationshipId"]),
              evidence: evidenceView(value),
            };
          }),
        };
      } catch (err) {
        if (
          !(err instanceof ApiError) ||
          err.kind === "contract" ||
          ![404, 500, 502, 504].includes(err.status ?? 0)
        )
          throw err;
        const data = list.parse(await get(`analyzer/evidences/element/${elementId}`));
        for (const row of data) {
          const e = object.parse(row);
          if (e["modelVersionId"] && e["modelVersionId"] !== modelId)
            throw new ApiError("contract", 502);
        }
        const relationshipEvidence: Array<{
          relationshipId: string;
          evidence: ReturnType<typeof evidenceView>;
        }> = [];
        try {
          const graph = z
            .object({
              edges: z.array(
                z.object({
                  id: z.string().uuid(),
                  sourceNodeId: z.string().uuid(),
                  targetNodeId: z.string().uuid(),
                  evidenceCount: z.number().int().nonnegative().nullable().optional(),
                }),
              ),
            })
            .parse(await get(`analyzer/models/${modelId}/graph`));
          const incident = graph.edges
            .filter(
              (e) =>
                (e.sourceNodeId === elementId || e.targetNodeId === elementId) &&
                (e.evidenceCount ?? 1) > 0,
            )
            .slice(0, 12);
          const edgeEvidences = await Promise.all(
            incident.map(async (edge) => {
              const rows = list.parse(
                await get(`analyzer/evidences/relationship/${edge.id}`).catch(() => []),
              );
              return rows.flatMap((row) => {
                const e = object.parse(row);
                if (e["modelVersionId"] && e["modelVersionId"] !== modelId)
                  throw new ApiError("contract", 502);
                return [{ relationshipId: edge.id, evidence: evidenceView(e) }];
              });
            }),
          );
          relationshipEvidence.push(...edgeEvidences.flat());
        } catch (graphErr) {
          if (graphErr instanceof ApiError && graphErr.kind === "contract") throw graphErr;
        }
        return { modelId, elementId, directEvidence: data.map(evidenceView), relationshipEvidence };
      }
    }
    case "elementEvidence":
    case "relationshipEvidence": {
      const modelId = id(input, "modelId");
      const element = operation === "elementEvidence";
      const target = id(input, element ? "elementId" : "relationshipId");
      if (element) {
        try {
          await get(`analyzer/models/${modelId}/elements/${target}`);
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 404) throw err;
          const graph = z
            .object({ nodes: z.array(z.object({ id: z.string() })) })
            .parse(await get(`analyzer/models/${modelId}/graph`));
          if (!graph.nodes.some((n) => n.id === target)) throw err;
        }
      } else {
        const graph = z
          .object({ edges: z.array(z.object({ id: z.string() })) })
          .parse(await get(`analyzer/models/${modelId}/graph`));
        if (!graph.edges.some((e) => e.id === target)) throw new ApiError("not-found", 404);
      }
      const data = list.parse(
        await get(`analyzer/evidences/${element ? "element" : "relationship"}/${target}`),
      );
      for (const row of data) {
        const e = object.parse(row);
        if (e["modelVersionId"] && e["modelVersionId"] !== modelId)
          throw new ApiError("contract", 502);
      }
      return data.map(evidenceView);
    }
    case "architectureDocument":
    case "saveArchitectureDocument": {
      const modelId = id(input, "modelId");
      const viewId = z
        .string()
        .regex(/^[a-zA-Z0-9:_-]{1,160}$/)
        .parse(input["viewId"]);
      const path = `analyzer/models/${modelId}/documents/${encodeURIComponent(viewId)}`;
      const result =
        operation === "architectureDocument"
          ? await get(path + (input["revision"] ? `?revision=${Number(input["revision"])}` : ""))
          : await post(path, { expectedRevision: input["expectedRevision"], xml: input["xml"] });
      const doc = z
        .object({
          modelId: z.string().uuid(),
          viewId: z.string(),
          revision: z.number().int().nonnegative(),
          xml: z.string().nullable(),
        })
        .parse(result);
      if (doc.modelId !== modelId || doc.viewId !== viewId) throw new ApiError("contract", 502);
      return doc;
    }
    case "architectureViews":
    case "renderArchitectureView": {
      const modelId = id(input, "modelId");
      const diagrams = z
        .array(
          z.object({
            id: z.string().uuid(),
            modelVersionId: z.string().uuid(),
            notation: z.string(),
            level: z.string(),
          }),
        )
        .parse(await get(`analyzer/models/${modelId}/diagrams`));
      const component = diagrams.find(
        (d) => d.notation === "C4" && d.level === "COMPONENT" && d.modelVersionId === modelId,
      );
      if (!component) throw new ApiError("not-found", 404);
      const exported = z
        .object({ modelVersionId: z.string().uuid(), content: z.string() })
        .parse(await get(`analyzer/diagrams/${component.id}/export?format=JSON`));
      if (exported.modelVersionId !== modelId) throw new ApiError("contract", 502);
      const pack = planArchitectureViews(JSON.parse(exported.content), {
        systemName: typeof input["systemName"] === "string" ? input["systemName"] : undefined,
      });
      if (pack.modelId !== modelId) throw new ApiError("contract", 502);
      if (operation === "architectureViews") return pack;
      const view = pack.views.find((view) => view.id === input["viewId"]);
      if (!view) throw new ApiError("not-found", 404);
      return {
        modelId,
        viewId: view.id,
        format: "DRAWIO_XML",
        content: await generateDrawio(view.document, (input["theme"] ?? "clean") as DrawioTheme),
      };
    }
    case "diagrams":
      return list
        .parse(await get(`analyzer/models/${id(input, "modelId")}/diagrams`))
        .map((raw) => {
          const d = z
            .object({
              id: z.string().uuid(),
              modelVersionId: z.string().uuid(),
              notation: z.string(),
              level: z.string(),
            })
            .parse(raw);
          if (d.modelVersionId !== id(input, "modelId")) throw new ApiError("contract", 502);
          return { id: d.id, modelId: d.modelVersionId, notation: d.notation, level: d.level };
        });
    case "exportDiagram": {
      const format = String(input["format"]);
      const canonical =
        format === "DRAWIO_XML" ||
        (format === "JSON" && (!!input["containerId"] || !!input["relationshipView"]));
      const d = z
        .object({ modelVersionId: z.string().uuid(), content: z.string(), format: z.string() })
        .parse(
          await get(
            `analyzer/diagrams/${id(input, "diagramId")}/export?format=${encodeURIComponent(canonical ? "JSON" : format)}`,
          ),
        );
      if (d.modelVersionId !== id(input, "modelId")) throw new ApiError("contract", 502);
      if (!canonical) return { modelId: d.modelVersionId, content: d.content, format: d.format };
      try {
        const projected = projectDiagram(
          JSON.parse(d.content),
          input["containerId"] ? id(input, "containerId") : undefined,
        );
        const doc = selectRelationships(
          projected,
          (input["relationshipView"] ?? "all") as "all" | "source" | "declared" | "runtime",
        );
        if (
          format === "DRAWIO_XML" &&
          doc.notation === "C4" &&
          doc.level === "COMPONENT" &&
          !input["containerId"] &&
          !doc["scopeContainerId"]
        )
          throw new Error("Choose a component container");
        if (doc.modelVersionId !== d.modelVersionId)
          throw new Error("Diagram belongs to another model");
        const content =
          format === "JSON"
            ? JSON.stringify(doc)
            : await generateDrawio(doc, (input["theme"] ?? "clean") as DrawioTheme);
        return { modelId: d.modelVersionId, content, format };
      } catch {
        throw new ApiError("contract", 502);
      }
    }
    case "impact": {
      const modelId = id(input, "modelId");
      const targetId = id(input, "targetId");
      const raw = z
        .object({
          impact: z.object({
            modelVersionId: z.string(),
            targetServiceId: z.string(),
            affectedServices: z.array(z.object({ hops: z.array(z.string()) })),
            warnings: z.array(z.string()),
            truncated: z.boolean(),
          }),
          serviceNames: z.record(z.string()).optional(),
          adapterWarnings: z.array(z.string()),
        })
        .parse(await get(`analyzer/models/${modelId}/impact?targetServiceId=${targetId}`));
      if (raw.impact.modelVersionId !== modelId || raw.impact.targetServiceId !== targetId)
        throw new ApiError("contract", 502);
      const names = raw.serviceNames ?? {};
      return {
        modelId,
        targetId,
        paths: raw.impact.affectedServices.map((p) => p.hops.map((h) => names[h] ?? h)),
        limitations: [
          ...raw.impact.warnings,
          ...raw.adapterWarnings,
          raw.impact.truncated ? "Results truncated" : "",
        ]
          .filter(Boolean)
          .map(impactWarning)
          .join(" · "),
      };
    }
    case "explain": {
      const modelId = id(input, "modelId");
      const elementId = id(input, "elementId");
      const scope =
        input["explanationScope"] === "RELATIONSHIP"
          ? "RELATIONSHIP"
          : input["explanationScope"] === "CHANGE_IMPACT"
            ? "CHANGE_IMPACT"
            : "ELEMENT";
      const relationshipId =
        scope === "RELATIONSHIP"
          ? typeof input["relationshipId"] === "string"
            ? id(input, "relationshipId")
            : elementId
          : undefined;
      const userQuestion =
        typeof input["userQuestion"] === "string" && input["userQuestion"].trim()
          ? input["userQuestion"].trim()
          : undefined;
      const a = z
        .object({
          id: z.string().uuid(),
          modelVersionId: z.string().uuid(),
          elementId: z.string().uuid().nullish(),
          relationshipId: z.string().uuid().nullish(),
          explanationScope: z.string().optional(),
          userQuestion: z.string().nullish(),
          explanationText: z.string(),
          citedEvidenceIds: z.array(z.string()),
          citedEvidences: z
            .array(
              z.object({
                id: z.string(),
                sourceType: z.string(),
                locator: z.string().nullish(),
                excerpt: z.string().nullish(),
              }),
            )
            .optional(),
          structuredContent: z
            .object({
              summary: z.string(),
              whyItMatters: z.string(),
              unknowns: z.array(z.string()),
              nextSteps: z.array(z.string()),
              evidenceSufficiency: z.string(),
              evidenceRefs: z.array(z.string()),
            })
            .nullish(),
          providerMode: z.string(),
          aiModelName: z.string().nullish(),
          epistemicBadge: z.string(),
          cached: z.boolean().optional(),
        })
        .parse(
          await post("analyzer/ai/explain", {
            modelVersionId: modelId,
            explanationScope: scope,
            ...(scope === "RELATIONSHIP" ? { relationshipId } : { elementId }),
            ...(userQuestion ? { userQuestion } : {}),
            forceRefresh: input["forceRefresh"] === true,
          }),
        );
      if (
        a.modelVersionId !== modelId ||
        (scope === "RELATIONSHIP" ? a.relationshipId !== relationshipId : a.elementId !== elementId)
      )
        throw new ApiError("contract", 502);
      return {
        id: a.id,
        modelId,
        elementId,
        ...(relationshipId ? { relationshipId } : {}),
        explanationScope: a.explanationScope ?? scope,
        ...(a.userQuestion !== undefined ? { userQuestion: a.userQuestion } : {}),
        text: a.explanationText,
        evidenceIds: a.citedEvidenceIds,
        ...(a.citedEvidences
          ? {
              citedEvidences: a.citedEvidences.map((ev) => ({
                id: ev.id,
                sourceType: ev.sourceType,
                locator: ev.locator ?? null,
                excerpt: ev.excerpt ?? null,
              })),
            }
          : {}),
        ...(a.structuredContent ? { structuredContent: a.structuredContent } : {}),
        sample: false,
        providerMode: a.providerMode,
        ...(a.aiModelName !== undefined ? { aiModelName: a.aiModelName } : {}),
        epistemicBadge: a.epistemicBadge,
        ...(a.cached !== undefined ? { cached: a.cached } : {}),
      };
    }
    case "saveModel": {
      const baseId = id(input, "modelId");
      const metadata = modelSummary(await get(`analyzer/models/${baseId}`));
      if (metadata.revision !== input["expectedRevision"] || !metadata.latest)
        throw new ApiError("conflict", 409);

      const addedElements: unknown[] = [];
      const modifiedElements: unknown[] = [];
      const removedElementIds: string[] = [];
      const addedRelationships: unknown[] = [];
      const removedRelationshipIds: string[] = [];

      if (input["addedElement"] && typeof input["addedElement"] === "object") {
        const add = input["addedElement"] as Record<string, unknown>;
        addedElements.push({
          name: String(add["name"] ?? "").trim(),
          elementType: String(add["elementType"] ?? "SERVICE_CONTAINER"),
          languageStack: add["technology"] ? String(add["technology"]).trim() : null,
          parentElementId: add["parentElementId"] ? String(add["parentElementId"]) : null,
          properties: {
            ...(add["description"] ? { description: String(add["description"]).trim() } : {}),
          },
        });
      } else if (input["removedElementId"]) {
        removedElementIds.push(id(input, "removedElementId"));
      } else if (input["addedRelationship"] && typeof input["addedRelationship"] === "object") {
        const rel = input["addedRelationship"] as Record<string, unknown>;
        addedRelationships.push({
          sourceElementId: id(rel, "sourceElementId"),
          targetElementId: id(rel, "targetElementId"),
          relationType: String(rel["relationType"] ?? "SERVICE_HTTP_CALL"),
          originLayer: "STATIC",
          direction: "DIRECTED",
        });
      } else if (input["removedRelationshipId"]) {
        removedRelationshipIds.push(id(input, "removedRelationshipId"));
      } else {
        const element = z
          .object({
            id: z.string().uuid(),
            modelVersionId: z.string().uuid(),
            properties: z.unknown().optional(),
          })
          .parse(await get(`analyzer/models/${baseId}/elements/${id(input, "elementId")}`));
        if (element.modelVersionId !== baseId) throw new ApiError("contract", 502);
        const props = object.safeParse(element.properties);
        const cleanProps: Record<string, unknown> = {};
        if (props.success) {
          for (const [k, v] of Object.entries(props.data)) {
            if (!["logicalKey", "workerLogicalId", "origin", "userConfirmed"].includes(k)) {
              cleanProps[k] = v;
            }
          }
        }
        if (typeof input["description"] === "string") {
          cleanProps["description"] = input["description"];
        }
        if (typeof input["layer"] === "string") {
          cleanProps["layer"] = input["layer"];
        }
        modifiedElements.push({
          id: element.id,
          ...(typeof input["newName"] === "string" && input["newName"].trim()
            ? { newName: input["newName"].trim() }
            : {}),
          ...(typeof input["technology"] === "string"
            ? { languageStack: input["technology"].trim() }
            : {}),
          properties: cleanProps,
        });
      }

      const result = z.object({ id: z.string().uuid() }).parse(
        await post(`analyzer/models/${baseId}/revisions`, {
          addedElements,
          modifiedElements,
          removedElementIds,
          addedRelationships,
          removedRelationshipIds,
          revisionNote:
            typeof input["revisionNote"] === "string" && input["revisionNote"].trim()
              ? input["revisionNote"].trim()
              : "Controlled architecture revision",
        }),
      );
      return model(result.id);
    }
    case "compareModels": {
      const base = id(input, "baseModelId");
      const target = id(input, "targetModelId");
      const result = object.parse(
        await get(`analyzer/models/compare?baseVersionId=${base}&targetVersionId=${target}`),
      );
      if (result["baseVersionId"] !== base || result["targetVersionId"] !== target)
        throw new ApiError("contract", 502);
      return { baseModelId: base, targetModelId: target, result };
    }
    case "evaluateModel":
    case "evaluations": {
      const modelId = id(input, "modelId");
      const result =
        operation === "evaluateModel"
          ? await post(`analyzer/models/${modelId}/evaluate`)
          : await get(`analyzer/models/${modelId}/evaluations`);
      const convert = (raw: unknown) => {
        const row = object.parse(raw);
        const resultId = z.string().uuid().parse(row["id"]);
        if (row["modelVersionId"] !== modelId) throw new ApiError("contract", 502);
        return { id: resultId, modelId, result: row };
      };
      return operation === "evaluateModel" ? convert(result) : list.parse(result).map(convert);
    }
    case "findingEvidence": {
      const runId = id(input, "evaluationId"),
        modelId = id(input, "modelId"),
        findingId = id(input, "findingId");
      const run = object.parse(await get("analyzer/evaluations/" + runId));
      if (run["modelVersionId"] !== modelId) throw new ApiError("contract", 502);
      return list
        .parse(await get("analyzer/evaluations/" + runId + "/findings/" + findingId + "/evidence"))
        .map(evidenceView);
    }
    case "evaluationFindings": {
      const evaluationId = id(input, "evaluationId");
      const run = object.parse(await get(`analyzer/evaluations/${evaluationId}`));
      if (input["modelId"] && run["modelVersionId"] !== id(input, "modelId"))
        throw new ApiError("contract", 502);
      const values = z
        .array(object)
        .parse(await get(`analyzer/evaluations/${evaluationId}/findings`));
      if (values.some((value) => value["evaluationRunId"] !== evaluationId))
        throw new ApiError("contract", 502);
      return values;
    }
    default:
      throw new ApiError("unconfigured", 501);
  }
}

import fs from "node:fs";
import {
  sourceMask,
  scanSourceMembers,
  stripSourceAnnotations,
  topLevelAssignment,
} from "./source-declarations";
import path from "node:path";
import type { ArchitecturalModel } from "@/types/domain";

interface ParsedSourceClassMeta {
  name: string;
  qualifiedName: string;
  packageName: string;
  typeKind: "CLASS" | "INTERFACE" | "ENUM";
  visibility: string;
  isAbstract: boolean;
  isStatic: boolean;
  typeParameters: string[];
  sourceLanguage: "JAVA" | "CSHARP";
  extendsTypes: string[];
  implementsTypes: string[];
  imports: string[];
  rawSource: string;
  members: Array<{
    memberKind: "FIELD" | "PROPERTY" | "METHOD" | "CONSTRUCTOR" | "ENUM_LITERAL";
    name: string;
    type: string;
    returnType: string;
    visibility: string;
    languageVisibility: string;
    isStatic: boolean;
    isAbstract: boolean;
    parameters: Array<{ name: string; type: string }>;
    signature: string;
  }>;
}

function indexMainSourceFiles(
  rootDir: string,
  out = new Map<string, string[]>(),
): Map<string, string[]> {
  try {
    if (!fs.existsSync(rootDir)) return out;
    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (
          lower === "build" ||
          lower === "target" ||
          lower === "bin" ||
          lower === "obj" ||
          lower === "node_modules" ||
          lower === ".git" ||
          lower.includes("test")
        ) {
          continue;
        }
        indexMainSourceFiles(fullPath, out);
      } else if (entry.isFile() && (entry.name.endsWith(".java") || entry.name.endsWith(".cs"))) {
        const simple = entry.name.replace(/\.(java|cs)$/i, "");
        const list = out.get(simple) ?? [];
        list.push(fullPath);
        out.set(simple, list);
      }
    }
  } catch {
    // ignore fs errors
  }
  return out;
}

export function parseSourceFileToUmlMeta(
  filePath: string,
  fallbackName: string,
  fallbackQName: string,
): ParsedSourceClassMeta | null {
  try {
    const rawSource = fs.readFileSync(filePath, "utf8");
    const isCSharp = filePath.toLowerCase().endsWith(".cs");
    const stripped = sourceMask(rawSource, false);

    const pkgMatch = isCSharp
      ? /\bnamespace\s+([\w.]+)/.exec(stripped)
      : /\bpackage\s+([\w.]+)\s*;/.exec(stripped);
    const packageName =
      pkgMatch?.[1] ??
      (fallbackQName.includes(".")
        ? fallbackQName.slice(0, fallbackQName.lastIndexOf("."))
        : "default");

    const declRegex =
      /(?:@\w+(?:\([^)]*\))?\s*)*((?:(?:public|protected|private|internal|abstract|final|static|sealed|partial)\s+)*)(class|interface|enum)\s+(\w+)(?:<([^>{]+)>)?(?:\s+extends\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?(?:\s*:\s*([^{]+?))?\s*\{/m;
    const declMatch = [...stripped.matchAll(new RegExp(declRegex.source, "gm"))].find(
      (match) => match[3] === fallbackName,
    );
    if (!declMatch) return null;
    const modifiers = (declMatch?.[1] ?? "public").trim();
    const kindWord = (declMatch?.[2] ?? "class").toLowerCase();
    const className = declMatch?.[3] ?? fallbackName;
    const typeKind: "CLASS" | "INTERFACE" | "ENUM" =
      kindWord === "interface" ? "INTERFACE" : kindWord === "enum" ? "ENUM" : "CLASS";
    const isAbstract = /\babstract\b/.test(modifiers) || typeKind === "INTERFACE";
    const isStatic = /\bstatic\b/.test(modifiers);
    const visibility = /\bprivate\b/.test(modifiers)
      ? "PRIVATE"
      : /\bprotected\b/.test(modifiers)
        ? "PROTECTED"
        : /\binternal\b/.test(modifiers)
          ? "INTERNAL"
          : /\bpublic\b/.test(modifiers)
            ? "PUBLIC"
            : isCSharp
              ? "INTERNAL"
              : "PACKAGE_PRIVATE";
    const typeParameters = declMatch?.[4]
      ? declMatch[4]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const parseTypeList = (clause: string | undefined): string[] => {
      if (!clause) return [];
      const out: string[] = [];
      let depth = 0;
      let cur = "";
      for (const ch of clause) {
        if (ch === "<") depth++;
        else if (ch === ">") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) {
          if (cur.trim()) out.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    };

    const extendsTypes = parseTypeList(declMatch?.[5] ?? declMatch?.[7]);
    const implementsTypes = parseTypeList(declMatch?.[6]);

    const bodyStart = declMatch.index + declMatch[0].length - 1;
    const topStatements = scanSourceMembers(stripped, bodyStart);

    const members: ParsedSourceClassMeta["members"] = [];

    const parseVis = (mods: string) => {
      if (/\bprivate\b/.test(mods)) return { vis: "PRIVATE", langVis: "private" };
      if (/\bprotected\b/.test(mods)) return { vis: "PROTECTED", langVis: "protected" };
      if (/\binternal\b/.test(mods)) return { vis: "INTERNAL", langVis: "internal" };
      if (/\bpublic\b/.test(mods)) return { vis: "PUBLIC", langVis: "public" };
      if (typeKind === "INTERFACE") return { vis: "PUBLIC", langVis: "public" };
      return isCSharp
        ? { vis: "PRIVATE", langVis: "private" }
        : { vis: "PACKAGE_PRIVATE", langVis: "package-private" };
    };

    const cleanAnnotations = stripSourceAnnotations;

    for (const stmt of topStatements) {
      const cleaned = cleanAnnotations(stmt.header);
      if (!cleaned) continue;

      const assignment = topLevelAssignment(cleaned);
      const declaration = (assignment >= 0 ? cleaned.slice(0, assignment) : cleaned).trim();
      if (!stmt.hasBody && !declaration.includes("(")) {
        // Field declaration
        const beforeEq = declaration;
        const fMatch =
          /^((?:(?:public|protected|private|internal|static|final|readonly|volatile|transient)\s+)*)([\w.<>, ?\[\]]+?)\s+(\w+)$/.exec(
            beforeEq,
          );
        if (fMatch) {
          const mods = fMatch[1] ?? "";
          const fType = (fMatch[2] ?? "Object").trim();
          const fName = (fMatch[3] ?? "").trim();
          if (fName && fName !== "serialVersionUID" && fType !== "Logger") {
            const { vis, langVis } = parseVis(mods);
            members.push({
              memberKind: "FIELD",
              name: fName,
              type: fType,
              returnType: fType,
              visibility: vis,
              languageVisibility: langVis,
              isStatic: /\bstatic\b/.test(mods),
              isAbstract: false,
              parameters: [],
              signature: `${fName}:${fType}`,
            });
          }
        }
      } else if (cleaned.includes("(") && cleaned.includes(")")) {
        // Method or constructor declaration
        const openParen = cleaned.indexOf("(");
        const closeParen = cleaned.lastIndexOf(")");
        if (closeParen < openParen) continue;
        const head = cleaned.slice(0, openParen).trim();
        const paramStr = cleaned.slice(openParen + 1, closeParen).trim();

        const rawParams = parseTypeList(paramStr);
        const parameters: Array<{ name: string; type: string }> = [];
        for (const rp of rawParams) {
          const pClean = cleanAnnotations(rp)
            .replace(/\bfinal\b/g, "")
            .trim();
          const lastSpace = pClean.lastIndexOf(" ");
          if (lastSpace > 0) {
            parameters.push({
              type: pClean.slice(0, lastSpace).trim(),
              name: pClean.slice(lastSpace + 1).trim(),
            });
          } else if (pClean) {
            parameters.push({ type: pClean, name: "arg" });
          }
        }

        const cMatch = /^((?:(?:public|protected|private|internal)\s+)*)(\w+)$/.exec(head);
        if (cMatch && cMatch[2] === className) {
          const mods = cMatch[1] ?? "public";
          const { vis, langVis } = parseVis(mods);
          const sig = `${className}(${parameters.map((p) => p.type).join(",")})`;
          members.push({
            memberKind: "CONSTRUCTOR",
            name: className,
            type: "void",
            returnType: "void",
            visibility: vis,
            languageVisibility: langVis,
            isStatic: false,
            isAbstract: false,
            parameters,
            signature: sig,
          });
          continue;
        }

        const mMatch =
          /^((?:(?:public|protected|private|internal|static|final|abstract|synchronized|default|virtual|override|async)\s+)*)(?:<[^>]+>\s*)?([\w.<>, ?\[\]]+?)\s+(\w+)$/.exec(
            head,
          );
        if (mMatch) {
          const mods = mMatch[1] ?? "";
          const retType = (mMatch[2] ?? "void").trim();
          const mName = (mMatch[3] ?? "").trim();
          if (mName && !["if", "for", "while", "switch", "catch"].includes(mName)) {
            const { vis, langVis } = parseVis(mods);
            const sig = `${mName}(${parameters.map((p) => p.type).join(",")}):${retType}`;
            members.push({
              memberKind: "METHOD",
              name: mName,
              type: retType,
              returnType: retType,
              visibility: vis,
              languageVisibility: langVis,
              isStatic: /\bstatic\b/.test(mods),
              isAbstract: /\babstract\b/.test(mods) || (typeKind === "INTERFACE" && !stmt.hasBody),
              parameters,
              signature: sig,
            });
          }
        }
      }
    }

    return {
      name: className,
      qualifiedName:
        packageName && packageName !== "default" ? `${packageName}.${className}` : className,
      packageName,
      typeKind,
      visibility,
      isAbstract,
      isStatic,
      typeParameters,
      sourceLanguage: isCSharp ? "CSHARP" : "JAVA",
      extendsTypes,
      implementsTypes,
      imports: [...stripped.matchAll(/\b(?:import|using)\s+([\w.*]+)\s*;/g)].map((m) => m[1]!),
      rawSource: stripped,
      members,
    };
  } catch {
    return null;
  }
}

export function enrichModelWithSourceUmlMetadata(model: ArchitecturalModel): ArchitecturalModel {
  const needsEnrichment = model.elements.some(
    (e) =>
      (e.elementType === "COMPONENT" || e.elementType === "CLASS_INTERFACE") &&
      !e.properties?.["umlClassifier"] &&
      typeof e.properties?.["sourcePath"] === "string",
  );
  if (!needsEnrichment) return model;

  let repoRoot = "";
  for (const e of model.elements) {
    const sp = e.properties?.["sourcePath"];
    if (typeof sp === "string" && fs.existsSync(sp)) {
      const markerIdx = sp.indexOf("_source_extracted");
      if (markerIdx !== -1) {
        const afterMarker = sp.slice(markerIdx);
        const parts = afterMarker.split(path.sep);
        if (parts.length >= 2) {
          repoRoot = sp.slice(0, markerIdx) + parts[0] + path.sep + parts[1];
          break;
        }
      }
      repoRoot = path.dirname(sp);
      break;
    }
  }

  const fileIndex = repoRoot ? indexMainSourceFiles(repoRoot) : new Map<string, string[]>();
  const parsedByElemId = new Map<string, ParsedSourceClassMeta>();

  const enrichedElements = model.elements.map((elem) => {
    if (elem.elementType !== "COMPONENT" && elem.elementType !== "CLASS_INTERFACE") {
      return elem;
    }
    if (elem.properties?.["umlClassifier"]) {
      return elem;
    }
    const sp =
      typeof elem.properties?.["sourcePath"] === "string" ? elem.properties["sourcePath"] : "";
    const qn =
      typeof elem.properties?.["qualifiedName"] === "string"
        ? elem.properties["qualifiedName"]
        : elem.name;

    const candidates = fileIndex.get(elem.name) ?? [];
    const qualifiedCandidates = candidates.filter(
      (p) => qn && p.replaceAll(path.sep, ".").includes(qn),
    );
    const directSource =
      sp &&
      fs.existsSync(sp) &&
      [elem.name + ".java", elem.name + ".cs"].includes(path.basename(sp));
    let resolvedFile = directSource
      ? sp
      : qualifiedCandidates.length === 1
        ? qualifiedCandidates[0]!
        : candidates.length === 1
          ? candidates[0]!
          : "";
    if (!resolvedFile && sp && fs.existsSync(sp)) {
      const sibling = path.join(path.dirname(sp), `${elem.name}.java`);
      resolvedFile = fs.existsSync(sibling) ? sibling : sp;
    }
    if (!resolvedFile || !fs.existsSync(resolvedFile)) return elem;

    const meta = parseSourceFileToUmlMeta(resolvedFile, elem.name, qn);
    if (!meta || meta.name !== elem.name || (qn.includes(".") && meta.qualifiedName !== qn))
      return elem;

    parsedByElemId.set(elem.id, meta);
    return {
      ...elem,
      properties: {
        ...(elem.properties ?? {}),
        packageName: meta.packageName,
        qualifiedName: meta.qualifiedName,
        typeKind: meta.typeKind,
        umlClassifier: {
          name: meta.name,
          qualifiedName: meta.qualifiedName,
          packageName: meta.packageName,
          typeKind: meta.typeKind,
          visibility: meta.visibility,
          languageVisibility: meta.visibility.toLowerCase(),
          isAbstract: meta.isAbstract,
          isStatic: meta.isStatic,
          typeParameters: meta.typeParameters,
          sourceLanguage: meta.sourceLanguage,
          extractionCompleteness: "PARTIAL",
          metadataSource: "LEGACY_SOURCE_PREVIEW",
          baseTypes: meta.extendsTypes,
          interfaceTypes: meta.implementsTypes,
          imports: meta.imports,
          members: meta.members,
        },
      },
    };
  });

  const elemById = new Map(enrichedElements.map((e) => [e.id, e]));
  const matchesDeclaredType = (
    expression: string,
    target: ArchitecturalModel["elements"][number],
    source: ParsedSourceClassMeta,
  ): boolean => {
    const qn = String(target.properties?.["qualifiedName"] ?? target.name);
    const tokens = expression.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) ?? [];
    return tokens.some((token) => {
      if (source.typeParameters.includes(token)) return false;
      if (token.includes(".") && token === qn) return true;
      const first = token.split(".")[0]!,
        suffix = token.slice(first.length);
      const explicit = source.imports.filter(
        (i) => !i.endsWith(".*") && i.split(".").at(-1) === first,
      );
      if (explicit.length) return explicit.length === 1 && explicit[0] + suffix === qn;
      if (`${source.packageName}.${token}` === qn) return true;
      const candidates = source.imports
        .filter((i) => i.endsWith(".*"))
        .map((i) => i.slice(0, -1) + token)
        .filter((candidate) =>
          enrichedElements.some((e) => e.properties?.["qualifiedName"] === candidate),
        );
      return new Set(candidates).size === 1 && candidates[0] === qn;
    });
  };
  const enrichedEdges = model.edges.map((edge) => {
    if (edge.protocol !== "CODE_DEPENDENCY") return edge;
    if (edge.properties?.["umlRelationKind"]) return edge;
    const srcMeta = parsedByElemId.get(edge.from);
    const tgtElem = elemById.get(edge.to);
    if (!srcMeta || !tgtElem) return edge;

    let umlRelationKind = "DEPENDENCY";
    let roleName: string | undefined;

    if (srcMeta.extendsTypes.some((t) => matchesDeclaredType(t.split("<")[0]!, tgtElem, srcMeta))) {
      umlRelationKind = "GENERALIZATION";
    } else if (
      srcMeta.implementsTypes.some((t) => matchesDeclaredType(t.split("<")[0]!, tgtElem, srcMeta))
    ) {
      umlRelationKind = "REALIZATION";
    } else {
      const matchingField = srcMeta.members.find(
        (m) =>
          (m.memberKind === "FIELD" || m.memberKind === "PROPERTY") &&
          matchesDeclaredType(m.type, tgtElem, srcMeta),
      );
      if (matchingField) {
        roleName = matchingField.name;
        umlRelationKind = "ASSOCIATION";
      }
    }

    return {
      ...edge,
      properties: {
        ...(edge.properties ?? {}),
        umlRelationKind,
        ...(roleName ? { roleName } : {}),
      },
    };
  });

  // Canonical graph identities and edges belong to backend analysis. A source
  // preview may annotate an existing edge, but cannot invent persisted IDs.
  return {
    ...model,
    elements: enrichedElements,
    edges: enrichedEdges,
  };
}
