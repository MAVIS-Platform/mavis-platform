import { z } from "zod";

// Provisional frontend contracts. Backend wire formats must be mapped and verified
// before enabling an operation; see docs/architecture/api-integration.md.
export const roleSchema = z.enum(["student", "lecturer", "admin"]);
export type AppRole = z.infer<typeof roleSchema>;
export const sessionSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), role: roleSchema }).nullable(),
});
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  repository: z.string(),
  status: z.enum(["ready", "processing", "failed", "unknown"]),
  services: z.number().int().nonnegative().nullable(),
  runtimeSupported: z.boolean().nullable(),
  description: z.string().nullable().optional(),
  defaultBranch: z.string().nullable().optional(),
  projectType: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  assignmentId: z.string().nullable().optional(),
  isReferenceTemplate: z.boolean().nullable().optional(),
  referenceSnapshotId: z.string().nullable().optional(),
  backendStatus: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});
export type Project = z.infer<typeof projectSchema>;
export const snapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  validation: z.enum(["valid", "invalid", "unsupported", "pending", "unknown"]),
  evidenceComplete: z.boolean().nullable(),
});
export type SourceSnapshot = z.infer<typeof snapshotSchema>;
export const analysisJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  snapshotId: z.string(),
  status: z.enum([
    "queued",
    "processing",
    "completed",
    "failed",
    "cancelling",
    "cancelled",
    "timed-out",
    "partial",
  ]),
  progress: z.number().min(0).max(100).nullable(),
  analysisState: z.string().optional(),
  workerStatus: z.string().nullable().optional(),
  modelId: z.string().nullable(),
  message: z.string(),
});
export type AnalysisJob = z.infer<typeof analysisJobSchema>;
export const evidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(["source", "runtime"]),
  location: z.string(),
  snippet: z.string(),
  complete: z.boolean().nullable(),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const elementSchema = z.object({
  id: z.string(),
  name: z.string(),
  layer: z.enum(["edge", "domain", "platform", "data", "unclassified"]),
  elementType: z.string().optional(),
  parentId: z.string().nullable().optional(),
  technology: z.string().nullable().optional(),
  properties: z.record(z.unknown()).optional(),
  description: z.string(),
  evidence: z.array(evidenceSchema),
});
export type ArchitectureElement = z.infer<typeof elementSchema>;
export const edgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  protocol: z.string(),
  evidence: z.array(evidenceSchema),
  uncertain: z.boolean(),
  originLayer: z.string().optional(),
  resolutionStatus: z.string().optional(),
  underlyingEdgeIds: z.array(z.string()).optional(),
});
export const modelSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    snapshotId: z.string(),
    revision: z.number().int().positive(),
    label: z.string(),
    elements: z.array(elementSchema),
    edges: z.array(edgeSchema),
  })
  .superRefine((model, ctx) => {
    const ids = new Set(model.elements.map((element) => element.id));
    if (
      ids.size !== model.elements.length ||
      new Set(model.edges.map((edge) => edge.id)).size !== model.edges.length ||
      model.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Graph identifiers or endpoints are invalid",
      });
  });
export type ArchitecturalModel = z.infer<typeof modelSchema>;
export const runtimeConfigurationSchema = z.object({
  projectId: z.string(),
  profileId: z.string(),
  supported: z.boolean(),
  prerequisites: z.array(z.string()),
  ready: z.boolean(),
  revision: z.number().int().positive(),
});
export const scenarioSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  steps: z.array(z.string().min(1)).min(1),
  revision: z.number().int().positive(),
});
export const runtimeSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  snapshotId: z.string(),
  scenarioId: z.string().nullable(),
  configurationRevision: z.number().int().positive().nullable(),
  scenarioRevision: z.number().int().positive().nullable(),
  executionStatus: z.string().optional(),
  scenarioStatus: z.string().optional(),
  evidenceStatus: z.string().optional(),
  cleanupStatus: z.string().optional(),
  status: z.enum([
    "pending",
    "running",
    "cancelling",
    "timed-out",
    "completed",
    "failed",
    "cancelled",
    "terminated",
    "unknown",
  ]),
  outcome: z.enum(["pending", "passed", "failed", "unknown"]),
  approvedAt: z.string().nullable(),
  events: z.array(z.object({ at: z.string(), message: z.string() })),
  traces: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      durationMs: z.number().nonnegative(),
      uncertain: z.boolean(),
    }),
  ),
});
export type RuntimeSession = z.infer<typeof runtimeSessionSchema>;
export const impactSchema = z.object({
  modelId: z.string(),
  targetId: z.string(),
  paths: z.array(z.array(z.string())),
  limitations: z.string(),
});
export const explanationSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  elementId: z.string(),
  text: z.string(),
  evidenceIds: z.array(z.string()),
  sample: z.boolean(),
  providerMode: z.string().optional(),
  epistemicBadge: z.string().optional(),
});
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().optional(),
  myRole: z.string().nullable().optional(),
  status: z.string().optional(),
  members: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
});
export const assignmentSchema = z.object({
  requiredDiagramTypes: z.array(z.string()).optional(),
  requireRuntimeTrace: z.boolean().optional(),
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  instructions: z.string(),
  dueAt: z.string(),
});
export const submissionSchema = z
  .object({
    id: z.string(),
    assignmentId: z.string(),
    studentId: z.string(),
    submittedAt: z.string(),
    model: modelSchema,
    snapshot: snapshotSchema,
    runtime: runtimeSessionSchema.nullable(),
    feedback: z.array(
      z.object({ id: z.string(), text: z.string(), createdAt: z.string(), authorId: z.string() }),
    ),
  })
  .superRefine((submission, ctx) => {
    if (
      submission.model.snapshotId !== submission.snapshot.id ||
      submission.model.projectId !== submission.snapshot.projectId ||
      (submission.runtime &&
        (submission.runtime.snapshotId !== submission.snapshot.id ||
          submission.runtime.projectId !== submission.snapshot.projectId))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Submitted versions do not reference the same source snapshot",
      });
  });
export type Submission = z.infer<typeof submissionSchema>;
export const accountSchema = z.object({
  status: z.string().optional(),
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  locked: z.boolean(),
});
export const integrationSchema = z.object({
  status: z.string().optional(),
  persistence: z.string().optional(),
  connectionVerified: z.boolean().optional(),
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  revision: z.number().int().positive(),
});
export const profileSchema = z.object({
  memoryMiB: z.number().int().min(64).max(2048).optional(),
  cpus: z.number().positive().max(4).optional(),
  timeoutSeconds: z.number().int().positive().max(300).optional(),
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  revision: z.number().int().positive(),
});
export const auditSchema = z.object({
  id: z.string(),
  at: z.string(),
  action: z.string(),
  actorId: z.string(),
  resourceId: z.string(),
});

export const modelSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  snapshotId: z.string(),
  revision: z.number().int().positive(),
  label: z.string(),
  latest: z.boolean().optional(),
  createdAt: z.string().nullable().optional(),
});
export type ModelSummary = z.infer<typeof modelSummarySchema>;
export const diagramSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  notation: z.string(),
  level: z.string(),
});
export const evaluationSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  result: z.record(z.unknown()),
});

export const runtimeReadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  snapshotId: z.string(),
  modelId: z.string().nullable(),
  scenarioName: z.string().nullable(),
  profileName: z.string().nullable(),
  executionStatus: z.string(),
  scenarioStatus: z.string(),
  evidenceStatus: z.string(),
  cleanupStatus: z.string(),
  traceQuality: z.string(),
  mappingStatus: z.string(),
  createdAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
