import { z } from "zod";
import {
  projectSchema,
  snapshotSchema,
  analysisJobSchema,
  evidenceSchema,
  modelSchema,
  modelSummarySchema,
} from "@/types/domain";
import { ApiError } from "@/lib/errors/api-error";
export const object = z.record(z.unknown());
const nullableText = z.string().nullish();
export const javaProject = z.object({
  id: z.string().uuid(),
  name: z.string(),
  repositoryUrl: nullableText,
  description: nullableText,
  defaultBranch: nullableText,
  projectType: nullableText,
  workspaceId: z.string().uuid().nullish(),
  assignmentId: z.string().uuid().nullish(),
  isReferenceTemplate: z.boolean().nullish(),
  referenceSnapshotId: z.string().uuid().nullish(),
  status: nullableText,
  createdAt: nullableText,
  updatedAt: nullableText,
});
export function projectView(raw: unknown) {
  const p = javaProject.parse(raw);
  return projectSchema.parse({
    id: p.id,
    name: p.name,
    repository: p.repositoryUrl ?? "",
    status: p.status === "ACTIVE" ? "ready" : "unknown",
    backendStatus: p.status ?? null,
    description: p.description ?? null,
    defaultBranch: p.defaultBranch ?? null,
    projectType: p.projectType ?? null,
    workspaceId: p.workspaceId ?? null,
    assignmentId: p.assignmentId ?? null,
    isReferenceTemplate: p.isReferenceTemplate ?? null,
    referenceSnapshotId: p.referenceSnapshotId ?? null,
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
    services: null,
    runtimeSupported: null,
  });
}
export const javaSnapshot = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceType: nullableText,
  branchName: nullableText,
  commitSha: nullableText,
  createdAt: nullableText,
});
export function snapshotView(raw: unknown) {
  const s = javaSnapshot.parse(raw);
  return snapshotSchema.parse({
    id: s.id,
    projectId: s.projectId,
    name: [s.sourceType ?? "Source", s.branchName, s.commitSha?.slice(0, 8)]
      .filter(Boolean)
      .join(" · "),
    createdAt: s.createdAt ?? "",
    validation: "unknown",
    evidenceComplete: null,
  });
}
export function modelSummary(raw: unknown) {
  const m = z
    .object({
      id: z.string().uuid(),
      projectId: z.string().uuid(),
      sourceSnapshotId: z.string().uuid(),
      revision: z.number().int().positive(),
      isLatestValid: z.boolean().nullish(),
      createdAt: nullableText,
    })
    .parse(raw);
  return modelSummarySchema.parse({
    id: m.id,
    projectId: m.projectId,
    snapshotId: m.sourceSnapshotId,
    revision: m.revision,
    label: `Revision ${m.revision}`,
    latest: m.isLatestValid ?? false,
    createdAt: m.createdAt ?? null,
  });
}
export function jobView(raw: unknown) {
  const j = z
    .object({
      jobId: z.string().uuid(),
      projectId: z.string().uuid(),
      sourceSnapshotId: z.string().uuid(),
      status: z.string(),
      modelVersionId: nullableText,
      errorDiagnostics: nullableText,
      analysisState: nullableText,
      dotnetStatus: nullableText,
    })
    .parse(raw);
  const states: Record<string, string> = {
    PENDING: "queued",
    QUEUED: "queued",
    RUNNING: "processing",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLING: "cancelling",
    CANCELLED: "cancelled",
    TIMED_OUT: "timed-out",
    TIMEOUT: "timed-out",
    PARTIAL: "partial",
  };
  const status = states[j.status];
  if (!status) throw new ApiError("contract");
  return analysisJobSchema.parse({
    id: j.jobId,
    projectId: j.projectId,
    snapshotId: j.sourceSnapshotId,
    status,
    progress: null,
    modelId: ["completed", "partial"].includes(status) ? (j.modelVersionId ?? null) : null,
    message: j.errorDiagnostics || j.analysisState || j.status,
    analysisState: j.analysisState ?? j.status,
    workerStatus: j.dotnetStatus ?? null,
  });
}
export function evidenceView(raw: unknown) {
  const e = z
    .object({
      id: z.string().uuid(),
      sourceType: z.string(),
      locator: nullableText,
      excerpt: nullableText,
    })
    .parse(raw);
  return evidenceSchema.parse({
    id: e.id,
    kind: e.sourceType.startsWith("RUNTIME") ? "runtime" : "source",
    sourceType: e.sourceType,
    location: e.locator ?? "",
    snippet: e.excerpt ?? "",
    complete: null,
  });
}
export function modelView(metadata: unknown, graph: unknown, details: unknown) {
  const summary = modelSummary(metadata);
  const g = z
    .object({
      nodes: z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          type: z.string(),
          sourcePath: nullableText,
        }),
      ),
      edges: z.array(
        z.object({
          id: z.string().uuid(),
          sourceNodeId: z.string().uuid(),
          targetNodeId: z.string().uuid(),
          kind: z.string(),
          originLayer: z.string().optional(),
          resolutionStatus: z.string().optional(),
        }),
      ),
    })
    .parse(graph);
  const d = z
    .array(
      z.object({
        id: z.string().uuid(),
        modelVersionId: z.string().uuid(),
        name: z.string(),
        elementType: z.string(),
        parentElementId: z.string().uuid().nullable().optional(),
        languageStack: z.string().nullable().optional(),
        properties: z.unknown().optional(),
      }),
    )
    .parse(details);
  if (d.some((e) => e.modelVersionId !== summary.id)) throw new ApiError("contract");
  const byId = new Map(d.map((e) => [e.id, e]));
  return modelSchema.parse({
    ...summary,
    elements: g.nodes.map((n) => {
      const detail = byId.get(n.id);
      const props = object.safeParse(detail?.properties);
      const properties = props.success ? props.data : {};
      const layer = ["edge", "domain", "platform", "data"].includes(String(properties["layer"]))
        ? properties["layer"]
        : "unclassified";
      return {
        id: n.id,
        name: n.name,
        elementType: n.type,
        parentId: detail?.parentElementId ?? null,
        technology: detail?.languageStack ?? null,
        layer,
        description:
          typeof properties["description"] === "string"
            ? properties["description"]
            : typeof properties["responsibility"] === "string"
              ? properties["responsibility"]
              : "",
        properties,
        evidence: [],
      };
    }),
    edges: g.edges.map((e) => ({
      id: e.id,
      from: e.sourceNodeId,
      to: e.targetNodeId,
      protocol: e.kind,
      uncertain: e.resolutionStatus !== "RESOLVED",
      originLayer: e.originLayer,
      resolutionStatus: e.resolutionStatus ?? "UNKNOWN",
      evidence: [],
    })),
  });
}
export function roleView(raw: string): "student" | "lecturer" | "admin" {
  const roles: Record<string, "student" | "lecturer" | "admin"> = {
    STUDENT: "student",
    LECTURER: "lecturer",
    SYSTEM_ADMIN: "admin",
    ADMIN: "admin",
  };
  const role = roles[raw.toUpperCase()];
  if (!role) throw new ApiError("contract");
  return role;
}
export function userView(raw: unknown) {
  const u = z.object({ id: z.string().uuid(), fullName: z.string(), role: z.string() }).parse(raw);
  return { id: u.id, name: u.fullName, role: roleView(u.role) };
}
