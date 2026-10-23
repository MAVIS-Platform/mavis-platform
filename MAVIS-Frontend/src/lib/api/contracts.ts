import { z } from "zod";
import * as d from "@/types/domain";

const id = z.string().min(1);
const project = z.object({ projectId: id });
const nothing = z.object({});
const ok = z.object({ ok: z.literal(true) });
function contract<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  input: I,
  output: O,
  mutation = false,
) {
  return { input, output, mutation };
}
export const contracts = {
  updateProfile: contract(
    z.object({
      fullName: z.string().trim().min(1).max(255),
      currentPassword: z.string().max(100).optional(),
      newPassword: z.string().min(6).max(100).optional(),
    }),
    d.sessionSchema,
    true,
  ),
  register: contract(
    z.object({
      fullName: z.string().trim().min(1).max(255),
      email: z.string().email(),
      password: z.string().min(6),
    }),
    z.object({ userId: z.string(), email: z.string(), fullName: z.string(), role: z.string() }),
    true,
  ),
  verifyEmail: contract(
    z.object({ email: z.string().email(), otpCode: z.string().trim().min(1).max(12) }),
    ok,
    true,
  ),
  resendOtp: contract(z.object({ email: z.string().email() }), ok, true),
  forgotPassword: contract(z.object({ email: z.string().email() }), ok, true),
  resetPassword: contract(
    z.object({
      email: z.string().email(),
      otpCode: z.string().trim().min(1).max(12),
      newPassword: z.string().min(6),
    }),
    ok,
    true,
  ),
  googleSignIn: contract(
    z.object({ idToken: z.string().min(1).max(10000) }),
    d.sessionSchema,
    true,
  ),
  session: contract(nothing, d.sessionSchema),
  runtimeSequence: contract(
    z.object({ sessionId: id }),
    z.object({
      sessionId: id,
      modelId: id,
      steps: z.array(
        z.object({
          stepOrder: z.number().nullish(),
          callerService: z.string().nullish(),
          calleeService: z.string().nullish(),
          operation: z.string().nullish(),
          httpMethod: z.string().nullish(),
          httpStatusCode: z.number().nullish(),
          durationMs: z.number().nullish(),
          traceId: z.string().nullish(),
        }),
      ),
    }),
  ),
  runtimeReadSessions: contract(project, z.array(d.runtimeReadSchema)),
  runtimeReadSession: contract(z.object({ sessionId: id }), d.runtimeReadSchema),
  runtimePreflight: contract(
    project.extend({ snapshotId: id }),
    z.object({
      compatible: z.boolean(),
      detectedServices: z.array(z.string()),
      securityWarnings: z.array(z.string()),
      recommendedProfile: z.string().nullable(),
    }),
    true,
  ),
  runtimeStop: contract(z.object({ sessionId: id }), d.runtimeReadSchema, true),
  runtimeApprove: contract(z.object({ sessionId: id }), d.runtimeReadSchema, true),
  signIn: contract(
    z.object({ email: z.string().email(), password: z.string().min(1) }),
    d.sessionSchema,
    true,
  ),
  createProject: contract(
    z.object({ name: z.string().trim().min(1).max(255) }),
    d.projectSchema,
    true,
  ),
  githubBranches: contract(
    z.object({ repositoryUrl: z.string().min(1) }),
    z.object({ defaultBranch: z.string(), branches: z.array(z.string()), truncated: z.boolean() }),
  ),
  importGithub: contract(
    project.extend({
      repositoryUrl: z.string().min(1),
      branchName: z.string().default("main"),
      commitSha: z.string().optional(),
    }),
    d.snapshotSchema,
    true,
  ),
  cancelAnalysis: contract(z.object({ jobId: id }), d.analysisJobSchema, true),
  modelVersions: contract(project, z.array(d.modelSummarySchema)),
  elementEvidence: contract(z.object({ modelId: id, elementId: id }), z.array(d.evidenceSchema)),
  relationshipEvidence: contract(
    z.object({ modelId: id, relationshipId: id }),
    z.array(d.evidenceSchema),
  ),
  diagrams: contract(z.object({ modelId: id }), z.array(d.diagramSchema)),
  architectureDocument: contract(
    z.object({ modelId: id, viewId: id, revision: z.number().int().positive().optional() }),
    z.object({
      modelId: id,
      viewId: id,
      revision: z.number().int().nonnegative(),
      xml: z.string().nullable(),
    }),
  ),
  saveArchitectureDocument: contract(
    z.object({
      modelId: id,
      viewId: id,
      expectedRevision: z.number().int().nonnegative(),
      xml: z.string().min(1).max(2000000),
    }),
    z.object({ modelId: id, viewId: id, revision: z.number().int().positive(), xml: z.string() }),
    true,
  ),
  architectureViews: contract(
    z.object({ modelId: id }),
    z.object({
      modelId: id,
      policyVersion: z.string(),
      status: z.literal("requires-review"),
      coverage: z.record(z.number()),
      findings: z.array(z.object({ code: z.string(), elementId: id, name: z.string() })),
      limitations: z.array(z.string()),
      views: z.array(
        z.object({
          id,
          title: z.string(),
          purpose: z.string(),
          kind: z.enum(["overview", "container", "component", "deployment", "messaging"]),
          document: z.unknown(),
        }),
      ),
    }),
  ),
  renderArchitectureView: contract(
    z.object({ modelId: id, viewId: id, theme: z.enum(["clean", "dark", "blueprint"]).optional() }),
    z.object({ modelId: id, viewId: id, content: z.string(), format: z.literal("DRAWIO_XML") }),
  ),
  exportDiagram: contract(
    z.object({
      modelId: id,
      diagramId: id,
      containerId: id.optional(),
      theme: z.enum(["clean", "dark", "blueprint"]).optional(),
      relationshipView: z.enum(["all", "source", "declared", "runtime"]).optional(),
      format: z.enum(["MERMAID", "PLANTUML", "DRAWIO_XML", "JSON"]),
    }),
    z.object({ modelId: id, content: z.string(), format: z.string() }),
  ),
  compareModels: contract(
    z.object({ baseModelId: id, targetModelId: id }),
    z.object({ baseModelId: id, targetModelId: id, result: z.record(z.unknown()) }),
  ),
  evaluateModel: contract(z.object({ modelId: id }), d.evaluationSchema, true),
  evaluations: contract(z.object({ modelId: id }), z.array(d.evaluationSchema)),
  evaluationFindings: contract(
    z.object({ evaluationId: id, modelId: id.optional() }),
    z.array(z.record(z.unknown())),
  ),
  mockLogin: contract(z.object({ role: d.roleSchema }), d.sessionSchema, true),
  signOut: contract(nothing, ok, true),
  projects: contract(nothing, z.array(d.projectSchema)),
  project: contract(project, d.projectSchema),
  snapshots: contract(project, z.array(d.snapshotSchema)),
  importSource: contract(
    project.extend({
      name: z.string().trim().min(1).max(100),
      fileName: z.string().regex(/\.zip$/i),
      size: z
        .number()
        .positive()
        .max(100 * 1024 * 1024),
      archive: z.instanceof(Blob),
    }),
    d.snapshotSchema,
    true,
  ),
  analysisJobs: contract(project, z.array(d.analysisJobSchema)),
  startAnalysis: contract(
    project.extend({ snapshotId: id, idempotencyKey: z.string().min(1).optional() }),
    d.analysisJobSchema,
    true,
  ),
  analysisJob: contract(z.object({ jobId: id }), d.analysisJobSchema),
  models: contract(project, z.array(d.modelSchema)),
  model: contract(z.object({ modelId: id, projectId: id.optional() }), d.modelSchema),
  saveModel: contract(
    z.object({
      modelId: id,
      expectedRevision: z.number().int().positive(),
      elementId: id,
      description: z.string().trim().min(1).max(2000),
    }),
    d.modelSchema,
    true,
  ),
  runtimeConfiguration: contract(project, d.runtimeConfigurationSchema),
  saveRuntimeConfiguration: contract(
    project.extend({ profileId: id, expectedRevision: z.number().int().positive() }),
    d.runtimeConfigurationSchema,
    true,
  ),
  scenarios: contract(project, z.array(d.scenarioSchema)),
  saveScenario: contract(
    z.object({
      scenarioId: id,
      expectedRevision: z.number().int().positive(),
      name: z.string().trim().min(1).max(100),
      steps: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
    }),
    d.scenarioSchema,
    true,
  ),
  runtimeSessions: contract(project, z.array(d.runtimeSessionSchema)),
  runtimeSession: contract(z.object({ sessionId: id }), d.runtimeSessionSchema),
  startRuntime: contract(
    project.extend({
      snapshotId: id,
      scenarioId: id,
      configurationRevision: z.number().int().positive(),
      scenarioRevision: z.number().int().positive(),
      approved: z.literal(true),
    }),
    d.runtimeSessionSchema,
    true,
  ),
  stopRuntime: contract(
    z.object({ sessionId: id, action: z.enum(["cancel", "terminate"]) }),
    d.runtimeSessionSchema,
    true,
  ),
  impact: contract(z.object({ modelId: id, targetId: id }), d.impactSchema),
  explain: contract(z.object({ modelId: id, elementId: id }), d.explanationSchema, true),
  workspaces: contract(nothing, z.array(d.workspaceSchema)),
  createWorkspace: contract(
    z.object({
      code: z.string().trim().min(1).max(50),
      name: z.string().trim().min(1).max(255),
      description: z.string().max(5000).optional(),
    }),
    d.workspaceSchema,
    true,
  ),
  updateWorkspace: contract(
    z.object({
      workspaceId: id,
      name: z.string().trim().min(1).max(255),
      description: z.string().max(5000).optional(),
    }),
    d.workspaceSchema,
    true,
  ),
  archiveWorkspace: contract(z.object({ workspaceId: id }), d.workspaceSchema, true),
  addWorkspaceMember: contract(
    z.object({
      workspaceId: id,
      email: z.string().email(),
      memberRole: z.enum(["STUDENT", "LECTURER"]),
    }),
    d.workspaceSchema,
    true,
  ),
  removeWorkspaceMember: contract(
    z.object({ workspaceId: id, userId: id }),
    d.workspaceSchema,
    true,
  ),
  createAssignment: contract(
    z.object({
      workspaceId: id,
      title: z.string().trim().min(1).max(255),
      description: z.string().max(10000).optional(),
      dueAt: z.string().datetime({ offset: true }).nullable(),
      requiredDiagramTypes: z.array(z.string()).max(10),
      requireRuntimeTrace: z.boolean(),
    }),
    d.assignmentSchema,
    true,
  ),
  assignments: contract(z.object({ workspaceId: id }), z.array(d.assignmentSchema)),
  referenceVersions: contract(
    z.object({ workspaceId: id }),
    z.array(z.object({ id, workspaceId: id, snapshot: d.snapshotSchema, model: d.modelSchema })),
  ),
  submissions: contract(nothing, z.array(d.submissionSchema)),
  submission: contract(z.object({ submissionId: id }), d.submissionSchema),
  submit: contract(
    z.object({
      assignmentId: id,
      projectId: id.optional(),
      modelId: id,
      snapshotId: id,
      diagramVersionId: id.optional(),
      evaluationRunId: id.nullable().optional(),
      runtimeSessionId: id.nullable(),
      submissionNotes: z.string().max(5000).optional(),
    }),
    d.submissionSchema,
    true,
  ),
  feedback: contract(
    z.object({
      submissionId: id,
      modelId: id,
      text: z.string().trim().min(1).max(5000),
      elementId: id.nullable().optional(),
      relationshipId: id.nullable().optional(),
    }),
    d.submissionSchema,
    true,
  ),
  accounts: contract(nothing, z.array(d.accountSchema)),
  setAccountLock: contract(z.object({ accountId: id, locked: z.boolean() }), d.accountSchema, true),
  integrations: contract(nothing, z.array(d.integrationSchema)),
  configureIntegration: contract(
    z.object({
      integrationId: id,
      enabled: z.boolean(),
      expectedRevision: z.number().int().positive(),
    }),
    d.integrationSchema,
    true,
  ),
  profiles: contract(nothing, z.array(d.profileSchema)),
  configureProfile: contract(
    z.object({
      profileId: id,
      enabled: z.boolean(),
      expectedRevision: z.number().int().positive(),
    }),
    d.profileSchema,
    true,
  ),
  audit: contract(nothing, z.array(d.auditSchema)),
  adminJobs: contract(nothing, z.array(d.analysisJobSchema)),
  platformSummary: contract(
    nothing,
    z.object({
      health: z.enum(["available", "degraded", "unknown"]),
      message: z.string(),
      projects: z.number().int().nonnegative(),
      users: z.number().int().nonnegative(),
      runningSessions: z.number().int().nonnegative(),
      analysisJobs: z.number().int().nonnegative(),
    }),
  ),
} as const;
export type Operation = keyof typeof contracts;
export type Request<K extends Operation> = z.infer<(typeof contracts)[K]["input"]>;
export type Response<K extends Operation> = z.infer<(typeof contracts)[K]["output"]>;
export interface ApiAdapter {
  readonly mode: "mock" | "backend";
  execute<K extends Operation>(
    operation: K,
    input: Request<K>,
    signal?: AbortSignal,
  ): Promise<Response<K>>;
}
export function isOperation(value: string): value is Operation {
  return Object.hasOwn(contracts, value);
}
