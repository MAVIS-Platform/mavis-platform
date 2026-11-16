import { z } from "zod";

// Provisional frontend contracts. Backend wire formats must be mapped and verified
// before enabling an operation; see docs/architecture/api-integration.md.
export const roleSchema = z.enum(["student", "lecturer", "admin"]);
export type AppRole = z.infer<typeof roleSchema>;
export const sessionSchema = z.object({
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      role: roleSchema,
      email: z.string().email().nullish(),
      avatarUrl: z.string().url().nullish(),
      preferredLocale: z.enum(["en", "vi"]).optional(),
    })
    .nullable(),
});
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  repository: z.string(),
  status: z.enum(["ready", "processing", "failed", "partial", "unknown"]),
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
  sourceType: z.string().nullish(),
  branchName: z.string().nullish(),
  commitSha: z.string().nullish(),
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  validation: z.enum(["valid", "invalid", "unsupported", "pending", "unknown"]),
  evidenceComplete: z.boolean().nullable(),
});
export type SourceSnapshot = z.infer<typeof snapshotSchema>;
export const analysisStateSchema = z.enum([
  "PENDING",
  "QUEUED",
  "DISPATCHED",
  "RUNNING",
  "PROCESSING",
  "CANCELLING",
  "CANCELLED",
  "FAILED",
  "TIMED_OUT",
  "TIMEOUT",
  "PARTIAL",
  "COMPLETED",
  "COMPLETED_WITH_REVIEW",
  "COMPLETED_LEGACY",
]);
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
  analysisState: analysisStateSchema.optional(),
  workerStatus: z.string().nullable().optional(),
  promotedLatest: z.boolean().nullable().optional(),
  modelId: z.string().nullable(),
  message: z.string(),
});
export type AnalysisJob = z.infer<typeof analysisJobSchema>;
export const communicationRoleSchema = z.enum([
  "CLIENT_DECLARATION",
  "CLIENT_CONFIGURATION",
  "CLIENT_CONTRACT",
  "CALL_SITE",
  "SERVER_ENDPOINT",
]);
export const evidenceSchema = z.object({
  id: z.string(),
  origin: z.enum(["persisted", "preview"]).optional(),
  kind: z.enum(["source", "runtime"]),
  sourceType: z.string().optional(),
  communicationRole: communicationRoleSchema.optional(),
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
  properties: z.record(z.string(), z.unknown()).optional(),
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
  evidenceCount: z.number().int().nonnegative().nullable().optional(),
  evidenceIds: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
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
  protectedInputsReady: z.boolean().optional(),
  projectId: z.string(),
  snapshotId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
  configured: z.boolean().optional(),
  profileId: z.string(),
  supported: z.boolean(),
  prerequisites: z.array(z.string()),
  ready: z.boolean(),
  revision: z.number().int().nonnegative(),
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
  modelId: z.string().nullable().optional(),
  enrichedModelId: z.string().nullable().optional(),
  studioVerified: z.boolean().optional(),
  configurationRevision: z.number().int().nonnegative().nullable(),
  scenarioRevision: z.number().int().nonnegative().nullable(),
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
      durationMs: z.number().nonnegative().nullable(),
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
  relationshipId: z.string().nullable().optional(),
  explanationScope: z.string().optional(),
  userQuestion: z.string().nullable().optional(),
  text: z.string(),
  evidenceIds: z.array(z.string()),
  citedEvidences: z
    .array(
      z.object({
        id: z.string(),
        sourceType: z.string(),
        locator: z.string().nullable().optional(),
        excerpt: z.string().nullable().optional(),
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
    .nullable()
    .optional(),
  sample: z.boolean(),
  providerMode: z.string().optional(),
  aiModelName: z.string().nullable().optional(),
  epistemicBadge: z.string().optional(),
  cached: z.boolean().optional(),
});
export const workspaceSchema = z.object({
  createdById: z.string().optional(),
  description: z.string().optional(),
  id: z.string(),
  name: z.string(),
  code: z.string().optional(),
  myRole: z.string().nullable().optional(),
  status: z.string().optional(),
  members: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
});
export const assignmentReferenceSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  snapshotId: z.string(),
  modelId: z.string(),
  revision: z.number().int().positive(),
  sourceType: z.string(),
  repositoryUrl: z.string().nullish(),
  branch: z.string().nullish(),
  commitSha: z.string().nullish(),
  artifactHash: z.string().nullish(),
});
export const assignmentSchema = z.object({
  referenceSource: assignmentReferenceSchema.nullish(),
  labMode: z.string().nullish(),
  requiredDiagramTypes: z.array(z.string()).optional(),
  ruleSetVersion: z.string().nullish(),
  requireRuntimeTrace: z.boolean().optional(),
  aiPolicy: z.union([z.record(z.string(), z.unknown()), z.string()]).nullish(),
  labOrder: z.number().int().positive().nullish(),
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  instructions: z.string(),
  dueAt: z.string(),
});
export const courseQuizEvidenceSchema = z.object({
  status: z.literal("PASSED"),
  attemptId: z.string(),
  quizVersion: z.number().int().positive(),
  correctCount: z.number().int().nonnegative(),
  questionCount: z.number().int().positive(),
  passPercent: z.number().int().min(1).max(100),
  submittedAt: z.string(),
  referenceModelId: z.string(),
  referenceSnapshotId: z.string(),
  artifactHash: z.string(),
  commitSha: z.string().nullable(),
});

export const studentSnapshotSchema = z.object({
  snapshotId: z.string().min(1).max(128),
  step: z.string().max(64).optional(),
  title: z.string().max(255).optional(),
  targetViewOrService: z.string().max(255).optional(),
  writtenExplanation: z.string().max(5000).optional(),
  capturedAt: z.string().nullable().optional(),
});
export type StudentSnapshotItem = z.infer<typeof studentSnapshotSchema>;

export const snapshotGradeSchema = z.object({
  snapshotId: z.string().min(1).max(128),
  title: z.string().max(255).nullable().optional(),
  score: z.number().min(0).max(10),
  comment: z.string().max(2000).nullable().optional(),
});
export type SnapshotGradeItem = z.infer<typeof snapshotGradeSchema>;

export const submissionSchema = z
  .object({
    assignmentTitle: z.string().optional(),
    guidedLab: z.boolean().optional(),
    studentName: z.string().optional(),
    studentEmail: z.string().optional(),
    diagramVersionId: z.string().nullish(),
    diagramNotation: z.string().optional(),
    submissionNotes: z.string().optional(),
    diagramLayout: z.record(z.string(), z.unknown()).optional(),
    evaluationRunId: z.string().nullable().optional(),
    complianceScore: z.number().nullable().optional(),
    evidencePackageDigest: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),
    courseQuizEvidence: courseQuizEvidenceSchema.nullish(),
    theoryEvidence: z.record(z.string(), z.unknown()).nullish(),
    studioEvidence:z.record(z.string(), z.unknown()).nullish(),
    studentSnapshots: z.array(studentSnapshotSchema).nullish(),
    id: z.string(),
    assignmentId: z.string(),
    studentId: z.string(),
    submittedAt: z.string(),
    model: modelSchema,
    snapshot: snapshotSchema,
    runtime: runtimeSessionSchema.nullable(),
    feedback: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        createdAt: z.string(),
        authorId: z.string(),
        authorName: z.string().optional(),
        elementId: z.string().nullable().optional(),
        relationshipId: z.string().nullable().optional(),
      }),
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
  createdAt: z.string().nullish(),
  email: z.string().optional(),
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
  origin: z.string().nullable().optional(),
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
  result: z.record(z.string(), z.unknown()),
});

export const runtimeStepResultSchema = z.object({
  id: z.string(),
  service: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  expectedStatus: z.number().nullable().optional(),
  statusCode: z.number().nullable().optional(),
  status: z.string(),
  durationMs: z.number().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  traceId: z.string().nullable().optional(),
  parentSpanId: z.string().nullable().optional(),
});
export type RuntimeStepResult = z.infer<typeof runtimeStepResultSchema>;

export const runtimeActionEvidenceSchema = z.object({
  action: z.string(),
  service: z.string(),
  replicasBefore: z.number(),
  replicasAfter: z.number(),
  metricsBefore: z.record(z.string(), z.unknown()),
  metricsAfter: z.record(z.string(), z.unknown()),
  confirmed: z.boolean(),
});

export const runtimeBeforeAfterComparisonSchema = z.object({
  action: z.string(),
  service: z.string(),
  replicasBefore: z.number().nullable().optional(),
  replicasAfter: z.number().nullable().optional(),
  requestCountBefore: z.number().nullable().optional(),
  requestCountAfter: z.number().nullable().optional(),
  p95LatencyMsBefore: z.number().nullable().optional(),
  p95LatencyMsAfter: z.number().nullable().optional(),
  errorRateBefore: z.number().nullable().optional(),
  errorRateAfter: z.number().nullable().optional(),
  capturedSpanCount: z.number().nullable().optional(),
  cleanupStatus: z.string().nullable().optional(),
  measurementStatus: z.string(),
  measurementNote: z.string(),
});

export const runtimeReadSchema = z.object({
  publicationGateStatus: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  diagnostics: z.array(z.string()).optional(),
  capturedSpanCount: z.number().nullable().optional(),
  studioVerified: z.boolean().optional(),
  assignmentId: z.string().nullable().optional(),
  labTitle: z.string().nullable().optional(),
  infrastructureActions: z.array(runtimeActionEvidenceSchema).optional(),
  beforeAfterComparison: z.array(runtimeBeforeAfterComparisonSchema).nullish(),
  stepResults: z.array(runtimeStepResultSchema).optional(),
  id: z.string(),
  projectId: z.string(),
  snapshotId: z.string(),
  modelId: z.string().nullable(),
  enrichedModelId: z.string().nullable().optional(),
  scenarioName: z.string().nullable(),
  profileName: z.string().nullable(),
  executionStatus: z.string(),
  scenarioStatus: z.string(),
  evidenceStatus: z.string(),
  cleanupStatus: z.string(),
  traceQuality: z.string(),
  traceStatus: z.string().optional(),
  mappingStatus: z.string(),
  createdAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type RuntimeReadSession = z.infer<typeof runtimeReadSchema>;
