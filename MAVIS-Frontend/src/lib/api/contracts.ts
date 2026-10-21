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
  session: contract(nothing, d.sessionSchema),
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
        .max(200 * 1024 * 1024),
      archive: z.instanceof(Blob),
    }),
    d.snapshotSchema,
    true,
  ),
  analysisJobs: contract(project, z.array(d.analysisJobSchema)),
  startAnalysis: contract(project.extend({ snapshotId: id }), d.analysisJobSchema, true),
  analysisJob: contract(z.object({ jobId: id }), d.analysisJobSchema),
  models: contract(project, z.array(d.modelSchema)),
  model: contract(z.object({ modelId: id }), d.modelSchema),
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
  assignments: contract(z.object({ workspaceId: id }), z.array(d.assignmentSchema)),
  referenceVersions: contract(
    z.object({ workspaceId: id }),
    z.array(z.object({ id, workspaceId: id, snapshot: d.snapshotSchema, model: d.modelSchema })),
  ),
  submissions: contract(nothing, z.array(d.submissionSchema)),
  submission: contract(z.object({ submissionId: id }), d.submissionSchema),
  submit: contract(
    z.object({ assignmentId: id, modelId: id, snapshotId: id, runtimeSessionId: id.nullable() }),
    d.submissionSchema,
    true,
  ),
  feedback: contract(
    z.object({ submissionId: id, modelId: id, text: z.string().trim().min(1).max(5000) }),
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
