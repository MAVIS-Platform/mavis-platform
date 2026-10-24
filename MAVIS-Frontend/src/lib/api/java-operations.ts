import { planArchitectureViews } from "../architecture/view-planner";
import { githubBranches, githubRevision } from "../github/branches";
import { generateDrawio } from "../drawio/server";
import { projectDiagram, selectRelationships, type DrawioTheme } from "../drawio/rules";
import { z } from "zod";
import { javaRequest } from "./java-client";
import {
  projectView,
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
    session: { user: userView({ id: raw.userId, fullName: raw.fullName, role: raw.role }) },
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
  const model = async (modelId: string) => {
    const [metadata, graph, details] = await Promise.all([
      get(`analyzer/models/${modelId}`),
      get(`analyzer/models/${modelId}/graph`),
      get(`analyzer/models/${modelId}/elements`),
    ]);
    return modelView(metadata, graph, details);
  };
  const workspace = async (raw: unknown) => {
    const w = z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        code: z.string(),
        status: z.string(),
        myRoleInWorkspace: z.string().nullish(),
      })
      .parse(raw);
    const members = z
      .array(z.object({ userId: z.string().uuid(), fullName: z.string(), memberRole: z.string() }))
      .parse(await get(`workspaces/${w.id}/members`));
    return {
      ...w,
      myRole: w.myRoleInWorkspace ?? null,
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
  const coursework = async (raw: unknown) => {
    const sub = z
      .object({
        id: z.string().uuid(),
        assignmentId: z.string().uuid(),
        projectId: z.string().uuid(),
        submittedById: z.string().uuid(),
        submittedAt: z.string(),
        sourceSnapshotId: z.string().uuid(),
        modelVersionId: z.string().uuid(),
        runtimeSessionId: z.string().uuid().nullish(),
      })
      .parse(raw);
    const [m, source, feedback, runtime] = await Promise.all([
      model(sub.modelVersionId),
      get(`analyzer/snapshots/${sub.sourceSnapshotId}`),
      get(`submissions/${sub.id}/feedbacks`),
      sub.runtimeSessionId
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
    return {
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
          }),
        )
        .parse(feedback)
        .map((f) => ({
          id: f.id,
          text: f.commentText,
          createdAt: f.createdAt,
          authorId: f.lecturerId,
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
    if (["COMPLETE", "PARTIAL"].includes(String(r["traceStatus"]))) {
      const sequence = z
        .object({
          runtimeSessionId: z.string(),
          steps: z.array(
            z.object({
              traceId: z.string().nullish(),
              spanId: z.string().nullish(),
              callerService: z.string(),
              calleeService: z.string(),
              durationMs: z.number().nonnegative().nullish(),
            }),
          ),
        })
        .parse(await get(`analyzer/runtime/sessions/${r["id"]}/sequence`));
      if (sequence.runtimeSessionId !== r["id"]) throw new ApiError("contract", 502);
      for (const [index, t] of sequence.steps.entries())
        traces.push({
          id: `${t.traceId ?? "unknown"}:${t.spanId ?? index}`,
          from: t.callerService,
          to: t.calleeService,
          durationMs: t.durationMs ?? null,
          uncertain: r["traceStatus"] !== "COMPLETE" || r["mappingStatus"] !== "MAPPED",
        });
    }
    const statuses: Record<string, string> = {
      NOT_STARTED: "pending",
      READY_FOR_DISPATCH: "pending",
      ALLOCATED: "pending",
      RUNNING: "running",
      CANCELLING: "cancelling",
      COMPLETED: "completed",
      FAILED: "failed",
      CANCELLED: "cancelled",
      TERMINATED: "terminated",
      TIMED_OUT: "timed-out",
    };
    return {
      id: r["id"],
      projectId: r["projectId"],
      snapshotId: r["sourceSnapshotId"],
      scenarioId: plan["scenarioId"] ?? null,
      configurationRevision: plan["configurationRevision"] ?? null,
      scenarioRevision: plan["scenarioRevision"] ?? null,
      status: statuses[execution] ?? "unknown",
      executionStatus: execution,
      scenarioStatus: String(r["scenarioStatus"] ?? "UNKNOWN"),
      evidenceStatus: String(r["evidenceStatus"] ?? "UNKNOWN"),
      cleanupStatus: String(r["cleanupStatus"] ?? "UNKNOWN"),
      outcome:
        r["scenarioStatus"] === "PASSED"
          ? "passed"
          : r["scenarioStatus"] === "FAILED"
            ? "failed"
            : "unknown",
      approvedAt: null,
      events: r["createdAt"]
        ? [
            {
              at: String(r["createdAt"]),
              message: `Execution: ${execution}; scenario: ${r["scenarioStatus"]}; evidence: ${r["evidenceStatus"]}; cleanup: ${r["cleanupStatus"]}`,
            },
          ]
        : [],
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
        scenarioName: z.string().nullish(),
        profileName: z.string().nullish(),
        executionStatus: z.string().nullish(),
        scenarioStatus: z.string().nullish(),
        evidenceStatus: z.string().nullish(),
        cleanupStatus: z.string().nullish(),
        traceQuality: z.string().nullish(),
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
      scenarioName: value.scenarioName ?? null,
      profileName: value.profileName ?? null,
      executionStatus: value.executionStatus ?? "UNKNOWN",
      scenarioStatus: value.scenarioStatus ?? "UNKNOWN",
      evidenceStatus: value.evidenceStatus ?? "UNKNOWN",
      cleanupStatus: value.cleanupStatus ?? "UNKNOWN",
      traceQuality: value.traceQuality ?? "UNKNOWN",
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
        status: z.string(),
      })
      .parse(raw);
    return {
      id: a.id,
      name: a.fullName,
      role: roleView(a.roleCode),
      locked: a.status === "LOCKED",
      status: a.status,
    };
  };
  const patch = (path: string, body: unknown) =>
    javaRequest(path, token, { method: "PATCH", body: JSON.stringify(body), signal });
  switch (operation) {
    case "runtimeConfiguration":
      return get(`analyzer/projects/${id(input, "projectId")}/runtime-plan`);
    case "saveRuntimeConfiguration":
      return javaRequest(`analyzer/projects/${id(input, "projectId")}/runtime-plan`, token, {
        method: "PUT",
        body: JSON.stringify(input),
        signal,
      });
    case "scenarios":
      return get(`analyzer/projects/${id(input, "projectId")}/runtime-plan/scenarios`);
    case "createScenario":
      return post(`analyzer/projects/${id(input, "projectId")}/runtime-plan/scenarios`, {
        ...input,
        expectedRevision: 0,
      });
    case "saveScenario":
      return javaRequest(
        `analyzer/projects/${id(input, "projectId")}/runtime-plan/scenarios/${id(input, "scenarioId")}`,
        token,
        { method: "PUT", body: JSON.stringify(input), signal },
      );
    case "startRuntime":
      return courseworkRuntime(
        await post(`analyzer/projects/${id(input, "projectId")}/runtime-plan/start`, input),
      );
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
    case "stopRuntime":
      return courseworkRuntime(
        await post(`analyzer/runtime/sessions/${id(input, "sessionId")}/stop`),
      );
    case "accounts":
      return list.parse(await get("admin/users")).map(account);
    case "setAccountLock":
      return account(
        await patch(`admin/users/${id(input, "accountId")}/status`, {
          newStatus: input["locked"] ? "LOCKED" : "ACTIVE",
        }),
      );
    case "integrations":
      return get("admin/integrations");
    case "profiles":
      return get("admin/profiles");
    case "configureIntegration":
      return patch(
        `admin/integrations/${encodeURIComponent(z.string().min(1).parse(input["integrationId"]))}`,
        input,
      );
    case "configureProfile":
      return patch(
        `admin/profiles/${encodeURIComponent(z.string().min(1).parse(input["profileId"]))}`,
        input,
      );
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

    case "workspaces":
      return Promise.all(list.parse(await get("workspaces")).map(workspace));
    case "createWorkspace":
      return workspace(await post("workspaces", input));
    case "updateWorkspace": {
      const current = object.parse(await get(`workspaces/${id(input, "workspaceId")}`));
      return workspace(
        await javaRequest(`workspaces/${id(input, "workspaceId")}`, token, {
          method: "PUT",
          body: JSON.stringify({
            ...input,
            description: input["description"] ?? current["description"] ?? null,
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
      return Promise.all(list.parse(await get("submissions/me")).map(coursework));
    case "submission":
      return coursework(await get(`submissions/${id(input, "submissionId")}`));
    case "submit": {
      const modelId = id(input, "modelId"),
        snapshotId = id(input, "snapshotId");
      const m = modelSummary(await get(`analyzer/models/${modelId}`));
      if (m.snapshotId !== snapshotId || (input["projectId"] && input["projectId"] !== m.projectId))
        throw new ApiError("validation", 422);
      let diagram = input["diagramVersionId"];
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
      return coursework(await get(`submissions/${sub}`));
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
      const value = z
        .object({
          runtimeSessionId: z.string().uuid(),
          modelVersionId: z.string().uuid(),
          steps: z.array(object),
        })
        .parse(await get(`analyzer/runtime/sessions/${sessionId}/sequence`));
      if (value.runtimeSessionId !== sessionId) throw new ApiError("contract", 502);
      return { sessionId, modelId: value.modelVersionId, steps: value.steps };
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
    case "project":
      return projectView(await get(`projects/${id(input, "projectId")}`));
    case "createProject":
      return projectView(await post("projects", { name: input["name"], projectType: "PERSONAL" }));
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
    case "elementEvidence":
    case "relationshipEvidence": {
      const modelId = id(input, "modelId");
      const element = operation === "elementEvidence";
      const target = id(input, element ? "elementId" : "relationshipId");
      if (element) await get(`analyzer/models/${modelId}/elements/${target}`);
      else {
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
      const pack = planArchitectureViews(JSON.parse(exported.content));
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
          adapterWarnings: z.array(z.string()),
        })
        .parse(await get(`analyzer/models/${modelId}/impact?targetServiceId=${targetId}`));
      if (raw.impact.modelVersionId !== modelId || raw.impact.targetServiceId !== targetId)
        throw new ApiError("contract", 502);
      return {
        modelId,
        targetId,
        paths: raw.impact.affectedServices.map((p) => p.hops),
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
      const a = z
        .object({
          id: z.string().uuid(),
          modelVersionId: z.string().uuid(),
          elementId: z.string().uuid(),
          explanationText: z.string(),
          citedEvidenceIds: z.array(z.string()),
          providerMode: z.string(),
          epistemicBadge: z.string(),
        })
        .parse(
          await post("analyzer/ai/explain", {
            modelVersionId: modelId,
            explanationScope: "ELEMENT",
            elementId,
          }),
        );
      if (a.modelVersionId !== modelId || a.elementId !== elementId)
        throw new ApiError("contract", 502);
      return {
        id: a.id,
        modelId,
        elementId,
        text: a.explanationText,
        evidenceIds: a.citedEvidenceIds,
        sample: false,
        providerMode: a.providerMode,
        epistemicBadge: a.epistemicBadge,
      };
    }
    case "saveModel": {
      const baseId = id(input, "modelId");
      const metadata = modelSummary(await get(`analyzer/models/${baseId}`));
      if (metadata.revision !== input["expectedRevision"] || !metadata.latest)
        throw new ApiError("conflict", 409);
      const element = z
        .object({
          id: z.string().uuid(),
          modelVersionId: z.string().uuid(),
          properties: z.unknown().optional(),
        })
        .parse(await get(`analyzer/models/${baseId}/elements/${id(input, "elementId")}`));
      if (element.modelVersionId !== baseId) throw new ApiError("contract", 502);
      const props = object.safeParse(element.properties);
      const result = z.object({ id: z.string().uuid() }).parse(
        await post(`analyzer/models/${baseId}/revisions`, {
          addedElements: [],
          modifiedElements: [
            {
              id: element.id,
              properties: {
                ...(props.success ? props.data : {}),
                description: input["description"],
              },
            },
          ],
          removedElementIds: [],
          addedRelationships: [],
          removedRelationshipIds: [],
          revisionNote: "Update element description",
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
