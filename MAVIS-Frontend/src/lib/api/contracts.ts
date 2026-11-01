import { z } from "zod";
import { verificationCodePattern } from "@/lib/auth/verification-code";
import * as d from "@/types/domain";

const id = z.string().min(1);
const project = z.object({ projectId: id });
const nothing = z.object({});
const ok = z.object({ ok: z.literal(true) });
const notificationReadAck=ok.extend({recipientId:z.string().uuid().optional(),readAt:z.string().datetime().optional(),asOf:z.string().datetime().optional(),unreadCount:z.number().int().nonnegative().optional(),before:z.string().datetime().optional(),notificationId:z.string().uuid().optional()});
function contract<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  input: I,
  output: O,
  mutation = false,
) {
  return { input, output, mutation };
}
const notificationCategory = z.enum(["WORKSPACE","ASSIGNMENT","SUBMISSION","ANALYSIS","RUNTIME","ACCOUNT","SYSTEM"]);
const notificationItem = z.object({ id:z.string().uuid(),category:notificationCategory,title:z.string(),body:z.string(),targetPath:z.string().refine(p=>/^\/(?!\/)/.test(p)&&!p.includes("\\")),createdAt:z.string().datetime(),readAt:z.string().datetime().nullable() });
const activityBase=z.object({id,projectId:id,projectName:z.string(),occurredAt:z.string().nullable(),projectDeleted:z.boolean(),targetId:id.nullable(),targetName:z.string().nullable(),actorId:id.nullable(),actorName:z.string().nullable()});
const activityItem=z.discriminatedUnion("kind",[
 activityBase.extend({kind:z.literal("ANALYSIS"),job:d.analysisJobSchema}),
 activityBase.extend({kind:z.literal("PROJECT_DELETED"),job:z.null()}),
 activityBase.extend({kind:z.literal("SNAPSHOT_DELETED"),job:z.null()}),
]);
export const contracts = {
  notifications: contract(z.object({page:z.number().int().min(0).max(10000),size:z.number().int().min(1).max(50),unreadOnly:z.boolean(),category:notificationCategory.optional()}),z.object({items:z.array(notificationItem),total:z.number().int().nonnegative(),unreadCount:z.number().int().nonnegative(),page:z.number().int(),size:z.number().int(),asOf:z.string().datetime(),recipientId:z.string().uuid().optional()})),
  readNotification: contract(z.object({notificationId:z.string().uuid()}),notificationReadAck,true),
  readAllNotifications: contract(z.object({before:z.string().datetime()}),notificationReadAck,true),
  updateProfile: contract(
    z
      .object({
        fullName: z.string().trim().min(1).max(255),
        currentPassword: z.string().min(1).max(100).optional(),
        newPassword: z.string().min(6).max(100).optional(),
      })
      .refine((value) => value.newPassword === undefined || Boolean(value.currentPassword), {
        path: ["currentPassword"],
        message: "Current Password is required when changing the password.",
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
    z.object({ email: z.string().email(), otpCode: z.string().regex(verificationCodePattern) }),
    ok,
    true,
  ),
  resendOtp: contract(z.object({ email: z.string().email() }), ok, true),
  forgotPassword: contract(z.object({ email: z.string().email() }), ok, true),
  resetPassword: contract(
    z.object({
      email: z.string().email(),
      otpCode: z.string().regex(verificationCodePattern),
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
      baseModelId: z.string().nullish(),
      snapshotId: z.string().nullish(),
      modelRevision: z.number().nullish(),
      baseModelRevision: z.number().nullish(),
      modelOrigin: z.string().nullish(),
      traceStatus: z.string().nullish(),
      mappingStatus: z.string().nullish(),
      startedAt: z.union([z.string(), z.number()]).nullish(),
      completedAt: z.union([z.string(), z.number()]).nullish(),
      limitations: z.array(z.string()).optional(),
      steps: z.array(
        z.object({
          stepOrder: z.number().nullish(),
          messageId: z.string().nullish(),
          callerService: z.string().nullish(),
          calleeService: z.string().nullish(),
          callerParticipantId: z.string().nullish(),
          calleeParticipantId: z.string().nullish(),
          callerElementId: z.string().nullish(),
          calleeElementId: z.string().nullish(),
          callerBaseElementId: z.string().nullish(),
          calleeBaseElementId: z.string().nullish(),
          callerResolutionStatus: z.string().nullish(),
          calleeResolutionStatus: z.string().nullish(),
          operation: z.string().nullish(),
          messageSort: z.string().nullish(),
          httpMethod: z.string().nullish(),
          httpStatusCode: z.number().nullish(),
          durationMs: z.number().nullish(),
          traceId: z.string().nullish(),
          spanId: z.string().nullish(),
          parentSpanId: z.string().nullish(),
          relationshipId: z.string().nullish(),
          baseRelationshipId: z.string().nullish(),
          candidateRelationshipIds: z.array(z.string()).nullish(),
          evidenceId: z.string().nullish(),
          provenanceType: z.string().nullish(),
          causalParentMessageIds: z.array(z.string()).optional(),
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
      servicePorts: z.record(z.number()).optional(),
      serviceStacks: z.record(z.string()).optional(),
      detectedEndpoints: z
        .array(
          z.object({
            service: z.string(),
            method: z.string(),
            path: z.string(),
            source: z.string().optional(),
          }),
        )
        .optional(),
      databaseChecks: z
        .array(
          z.object({
            service: z.string(),
            dbType: z.string(),
            configKey: z.string().optional(),
            connectionUrl: z.string().optional(),
            requiredEnvVars: z.array(z.string()).optional(),
            status: z.string().optional(),
          }),
        )
        .optional(),
      requiredEnvVars: z
        .array(
          z.object({
            name: z.string(),
            service: z.string().optional(),
            services: z.array(z.string()).optional(),
            category: z.string().optional(),
            defaultValue: z.string().nullable().optional(),
            required: z.boolean().optional(),
            source: z.string().optional(),
            scope: z.string().nullable().optional(),
            resolution: z.string().nullable().optional(),
            defaultPresent: z.boolean().optional(),
          }),
        )
        .optional(),
      runnerIssues: z.array(z.string()).optional(),
      infrastructureServices: z.array(z.string()).optional(),
      serviceHealthPaths: z.record(z.string()).optional(),
      serviceHealthConfidence: z.record(z.string()).optional(),
      serviceHealthReasons: z.record(z.string()).optional(),
      composeServices: z.array(z.string()).optional(),
      sandboxComposeYaml: z.string().nullable().optional(),
      sandboxComposeChanges: z.array(z.string()).optional(),
      unresolvableRunnerIssues: z.array(z.string()).optional(),
      recommendedServiceMappings: z.record(z.string()).optional(),
      modelServiceNames: z.record(z.string()).optional(),
      localImageBuildAvailable: z.boolean().optional(),
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
    z
      .object({
        name: z.string().trim().min(1).max(255),
        repositoryUrl: z.string().url().optional(),
        defaultBranch: z.string().trim().min(1).max(255).optional(),
        workspaceId: id.optional(),
        assignmentId: id.optional(),
        referenceSnapshotId: id.optional(),
      })
      .refine(
        (value) => !value.assignmentId || !!value.workspaceId,
        "Assignment projects require a workspace",
      ),
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
  findingEvidence: contract(
    z.object({ modelId: id, evaluationId: id, findingId: id }),
    z.array(d.evidenceSchema),
  ),
  elementEvidence: contract(z.object({ modelId: id, elementId: id }), z.array(d.evidenceSchema)),
  elementEvidenceContext: contract(
    z.object({ modelId: id, elementId: id }),
    z.object({
      modelId: id,
      elementId: id,
      directEvidence: z.array(d.evidenceSchema),
      relationshipEvidence: z.array(z.object({ relationshipId: id, evidence: d.evidenceSchema })),
    }),
  ),
  relationshipEvidence: contract(
    z.object({ modelId: id, relationshipId: id }),
    z.array(d.evidenceSchema),
  ),
  diagrams: contract(z.object({ modelId: id }), z.array(d.diagramSchema)),
  documentRevisions: contract(
    z.object({ modelId: id }),
    z.array(
      z.object({
        modelId: id,
        viewId: z.string(),
        revision: z.number().int().positive(),
        savedAt: z.string().nullable(),
      }),
    ),
  ),
  freezeArtifacts: contract(
    z.object({
      modelId: id,
      documents: z.array(
        z.object({
          viewId: z.string().regex(/^[a-zA-Z0-9:_-]{1,160}$/),
          revision: z.number().int().positive(),
        }),
      ),
      diagramVersionIds: z.array(id),
    }),
    z.object({ modelId: id, diagramVersionId: id }),
    true,
  ),
  submissionExport: contract(z.object({ submissionId: id }), z.record(z.unknown())),
  submissionReview: contract(
    z.object({ submissionId: id }),
    z.object({
      submissionId: id,
      revision: z.number().int().nonnegative(),
      status: z.enum(["PENDING", "DRAFT", "RETURNED", "GRADED"]),
      score: z.number().min(0).max(100).nullable(),
      summary: z.string(),
      lecturerId: z.string().nullable(),
      lecturerName: z.string().nullable(),
      updatedAt: z.string().nullable(),
    }),
  ),
  gradeSubmission: contract(
    z.object({
      submissionId: id,
      expectedRevision: z.number().int().nonnegative(),
      status: z.enum(["DRAFT", "RETURNED", "GRADED"]),
      score: z.number().min(0).max(100).nullable(),
      summary: z.string().max(10000),
    }),
    z.object({
      submissionId: id,
      revision: z.number().int().positive(),
      status: z.enum(["DRAFT", "RETURNED", "GRADED"]),
      score: z.number().min(0).max(100).nullable(),
      summary: z.string(),
      lecturerId: z.string().nullable(),
      lecturerName: z.string().nullable(),
      updatedAt: z.string().nullable(),
    }),
    true,
  ),
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
    z.object({ modelId: id, systemName: z.string().trim().min(1).max(200).optional() }),
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
    z.object({
      modelId: id,
      viewId: id,
      theme: z.enum(["clean", "dark", "blueprint"]).optional(),
      systemName: z.string().trim().min(1).max(200).optional(),
    }),
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
  projectOverviews: contract(nothing, z.array(d.projectSchema)),
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
  projectActivity: contract(z.object({page:z.number().int().min(0).max(10000),size:z.number().int().min(1).max(50)}),z.object({items:z.array(activityItem),total:z.number().int().nonnegative(),page:z.number().int(),size:z.number().int()})),
  projectAnalysisActivity: contract(z.object({page:z.number().int().min(0).max(10000),size:z.number().int().min(1).max(50)}),z.object({items:z.array(d.analysisJobSchema.extend({projectName:z.string(),startedAt:z.string().nullable(),completedAt:z.string().nullable()})),total:z.number().int().nonnegative(),page:z.number().int(),size:z.number().int()})),
  analysisJobs: contract(project, z.array(d.analysisJobSchema)),
  startAnalysis: contract(
    project.extend({ snapshotId: id, idempotencyKey: z.string().min(1).optional() }),
    d.analysisJobSchema,
    true,
  ),
  analysisJob: contract(z.object({ jobId: id }), d.analysisJobSchema),
  models: contract(project, z.array(d.modelSchema)),
  model: contract(z.object({ modelId: id, projectId: id.optional() }), d.modelSchema),
  deleteProject: contract(project, ok, true),
  deleteSnapshot: contract(z.object({projectId:id,snapshotId:id}),ok,true),
  contextCandidates: contract(z.object({modelId:id}), z.object({entries:z.array(z.record(z.unknown()))})),
  reviewContext: contract(z.object({
    modelId: id, expectedRevision: z.number().int().positive(),
    action: z.enum(["SUGGEST", "PROPOSE", "EDIT", "CONFIRM", "REJECT"]),
    candidateId: z.string().optional(), name: z.string().trim().min(1).max(255).optional(),
    kind: z.enum(["PERSON", "EXTERNAL_SYSTEM"]).optional(), targetKey: z.string().max(500).optional(),
    direction: z.enum(["INBOUND", "OUTBOUND"]).optional(), basis: z.string().trim().max(2000).optional(),
    boundary: z.string().trim().min(10).max(2000).optional(), evidenceIds: z.array(z.string().uuid()).max(20).optional(),
  }), d.modelSchema, true),
  saveModel: contract(
    z.object({
      modelId: id,
      expectedRevision: z.number().int().positive(),
      elementId: id.optional(),
      description: z.string().trim().min(1).max(2000).optional(),
      newName: z.string().trim().min(1).max(255).optional(),
      technology: z.string().trim().max(120).optional(),
      layer: z.enum(["edge", "domain", "platform", "data", "unclassified"]).optional(),
      addedElement: z
        .object({
          name: z.string().trim().min(1).max(255),
          elementType: z.enum([
            "SERVICE_CONTAINER",
            "COMPONENT",
            "DATABASE",
            "QUEUE_BROKER",
            "EXTERNAL_SYSTEM",
            "CLASS_INTERFACE",
          ]),
          technology: z.string().trim().max(120).optional(),
          description: z.string().trim().max(2000).optional(),
          parentElementId: id.nullable().optional(),
        })
        .optional(),
      removedElementId: id.optional(),
      addedRelationship: z
        .object({
          sourceElementId: id,
          targetElementId: id,
          relationType: z.enum(["SERVICE_HTTP_CALL", "CODE_DEPENDENCY", "DATABASE_ACCESS"]),
        })
        .optional(),
      removedRelationshipId: id.optional(),
      revisionNote: z.string().trim().max(500).optional(),
    }),
    d.modelSchema,
    true,
  ),
  runtimeConfiguration: contract(project, d.runtimeConfigurationSchema),
  buildRuntimeSandboxImages: contract(
    project.extend({
      snapshotId: id.optional(),
      services: z.array(z.string().min(1).max(64)).max(20).optional(),
    }),
    z.object({
      projectId: id,
      snapshotId: id.nullable().optional(),
      builtImages: z.record(z.string()),
      errors: z.array(z.string()),
    }),
    true,
  ),
  saveRuntimeConfiguration: contract(
    project.extend({
      profileId: id,
      snapshotId: id.optional(),
      modelId: id.optional(),
      profile: z.record(z.unknown()).optional(),
      expectedRevision: z.number().int().nonnegative(),
    }),
    d.runtimeConfigurationSchema,
    true,
  ),
  scenarios: contract(project, z.array(d.scenarioSchema)),
  createScenario: contract(
    project.extend({
      name: z.string().trim().min(1).max(100),
      steps: z.array(z.string().trim().min(1).max(10000)).min(1).max(30),
    }),
    d.scenarioSchema,
    true,
  ),
  saveScenario: contract(
    z.object({
      scenarioId: id,
      projectId: id.optional(),
      expectedRevision: z.number().int().positive(),
      name: z.string().trim().min(1).max(100),
      steps: z.array(z.string().trim().min(1).max(10000)).min(1).max(30),
    }),
    d.scenarioSchema,
    true,
  ),
  generateRuntimeScenario: contract(
    project.extend({
      snapshotId: id.optional(),
      modelId: id.optional(),
      goal: z.string().trim().max(500).optional(),
      repairSessionId: id.optional(),
    }),
    z.object({
      projectId: id,
      snapshotId: id.nullable().optional(),
      modelId: id.nullable().optional(),
      suggestedName: z.string(),
      generatorMode: z.enum(["AI_ASSISTED", "SYSTEM_STATIC"]),
      aiModelName: z.string().nullable().optional(),
      summary: z.string(),
      steps: z.array(
        z.object({
          id: z.string().optional(),
          service: z.string(),
          method: z.string(),
          path: z.string(),
          expectedStatus: z.number().int().optional(),
          rationale: z.string().optional(),
          source: z.string().optional(),
          environmentVariables: z.record(z.string()).nullable().optional(),
          envHeaders: z.array(z.object({ name: z.string(), reference: z.string() })).nullable().optional(),
          bodyReference: z.string().nullable().optional(),
          allowClientError: z.boolean().nullable().optional(),
          headers: z.record(z.string()).nullable().optional(),
          extract: z.record(z.string()).nullable().optional(),
          journeyPhase: z.string().nullable().optional(),
        }),
      ),
      sampleInputs: z.record(z.string()).nullable().optional(),
      inheritedEnvKeys: z.array(z.string()).nullable().optional(),
      runnableServices: z.array(z.string()).nullable().optional(),
    }),
    true,
  ),
  runtimeSessions: contract(project, z.array(d.runtimeSessionSchema)),
  runtimeSession: contract(z.object({ sessionId: id }), d.runtimeSessionSchema),
  startRuntime: contract(
    project.extend({
      snapshotId: id,
      scenarioId: id,
      modelId: id.optional(),
      scenarioName: z.string().optional(),
      steps: z
        .array(
          z.object({
            id: z.string().optional(),
            title: z.string().optional(),
            service: z.string().optional(),
            serviceId: z.string().optional(),
            method: z.string(),
            path: z.string(),
            expectedStatus: z.union([z.number(), z.string()]).optional(),
            status: z.union([z.number(), z.string()]).optional(),
          }),
        )
        .optional(),
      configurationRevision: z.number().int().nonnegative().transform((v) => Math.max(1, v)),
      scenarioRevision: z.number().int().nonnegative().transform((v) => Math.max(1, v)),
      environment: z.record(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), z.string().max(16000)).refine(v => Object.keys(v).length <= 64).optional(),
      approved: z.literal(true).default(true),
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
  explain: contract(
    z.object({
      modelId: id,
      elementId: id,
      relationshipId: id.optional(),
      explanationScope: z.enum(["ELEMENT", "RELATIONSHIP", "CHANGE_IMPACT"]).optional(),
      userQuestion: z.string().trim().max(1000).optional(),
      forceRefresh: z.boolean().optional(),
      locale: z.enum(["en", "vi"]).optional(),
    }),
    d.explanationSchema,
    true,
  ),
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
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
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
  batchWorkspaceMembers: contract(
    z.object({ workspaceId: id, emails: z.array(z.string().email()).min(1).max(200) }),
    z.object({
      addedCount: z.number(),
      addedEmails: z.array(z.string()),
      alreadyMemberEmails: z.array(z.string()),
      notFoundEmails: z.array(z.string()),
    }),
    true,
  ),
  workspaceProjects: contract(z.object({ workspaceId: id }), z.array(d.projectSchema)),
  createReferenceProject: contract(
    z.object({ workspaceId: id, name: z.string().trim().min(1).max(255) }),
    d.projectSchema,
    true,
  ),
  publishReference: contract(
    z.object({ workspaceId: id, projectId: id, snapshotId: id }),
    d.snapshotSchema,
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
      referenceModelId: id.optional(),
      clearReferenceSource: z.boolean().optional(),
    }),
    d.assignmentSchema,
    true,
  ),
  assignments: contract(z.object({ workspaceId: id }), z.array(d.assignmentSchema)),
  updateAssignment: contract(
    z.object({
      workspaceId: id,
      assignmentId: id,
      title: z.string().trim().min(1).max(255),
      description: z.string().max(10000),
      dueAt: z.string().datetime({ offset: true }).nullable(),
      requiredDiagramTypes: z.array(z.string()).max(10),
      requireRuntimeTrace: z.boolean(),
      referenceModelId: id.optional(),
      clearReferenceSource: z.boolean().optional(),
    }),
    d.assignmentSchema,
    true,
  ),
  deleteAssignment: contract(z.object({ workspaceId: id, assignmentId: id }), ok, true),
  referenceVersions: contract(
    z.object({ workspaceId: id }),
    z.array(z.object({ id, workspaceId: id, snapshot: d.snapshotSchema, model: d.modelSchema })),
  ),
  submissions: contract(nothing, z.array(d.submissionSchema)),
  assignmentSubmissions: contract(
    z.object({ workspaceId: id, assignmentId: id }),
    z.array(d.submissionSchema),
  ),
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
  updateFeedback: contract(
    z.object({ submissionId: id, feedbackId: id, text: z.string().trim().min(1).max(5000) }),
    d.submissionSchema,
    true,
  ),
  deleteFeedback: contract(
    z.object({ submissionId: id, feedbackId: id }),
    d.submissionSchema,
    true,
  ),
  accounts: contract(nothing, z.array(d.accountSchema)),
  setAccountLock: contract(z.object({ accountId: id, locked: z.boolean() }), d.accountSchema, true),
  setAccountRole: contract(
    z.object({ accountId: id, role: z.enum(["student", "lecturer", "admin"]) }),
    d.accountSchema,
    true,
  ),
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
      memoryMiB: z.number().int().min(64).max(2048).optional(),
      cpus: z.number().positive().max(4).optional(),
      timeoutSeconds: z.number().int().positive().max(300).optional(),
      enabled: z.boolean(),
      expectedRevision: z.number().int().positive(),
    }),
    d.profileSchema,
    true,
  ),
  audit: contract(nothing, z.array(d.auditSchema)),
  adminJobs: contract(nothing, z.array(d.analysisJobSchema)),
  adminAiUsage: contract(
    nothing,
    z.object({
      eventsAvailable: z.boolean().optional(),
      events: z.array(z.object({
        requestId: z.string(), recordedAt: z.string(), source: z.string(),
        provider: z.string(), model: z.string(), inputTokens: z.number(), outputTokens: z.number(),
        userId: z.string().nullable(), userName: z.string().nullable(), userEmail: z.string().nullable(),
      })).optional(),
      status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
      updatedAt: z.string(),
      message: z.string().nullable(),
      providers: z.array(
        z.object({
          provider: z.enum(["openai", "gemini"]),
          model: z.string().nullable(),
          usage: z
            .object({
              inputTokens: z.number().int().nonnegative(),
              outputTokens: z.number().int().nonnegative(),
              requestCount: z.number().int().nonnegative(),
            })
            .nullable(),
          geminiQuota: z.object({
            scope: z.literal("project"),
            samples: z.array(z.object({
              model: z.string(), metric: z.string(), limitName: z.string(),
              kind: z.enum(["limit", "usage"]), value: z.number(),
              measuredAt: z.string(), startTime: z.string().optional(),
            })),
            partial: z.boolean(),
          }).nullable().optional(),
          providerDataMessage: z.string().nullable().optional(),
          providerDataUpdatedAt: z.string().nullable().optional(),
          providerUsage: z.object({
            scope: z.literal("project"),
            inputTokens: z.number().nonnegative(),
            outputTokens: z.number().nonnegative(),
            requestCount: z.number().nonnegative(),
            startTime: z.string(),
            endTime: z.string(),
          }).nullable().optional(),
          coverage: z.object({
            java: z.enum(["OBSERVED", "UNKNOWN"]),
            next: z.enum(["OBSERVED", "UNKNOWN"]),
          }).optional(),
          limits: z.object({
            scope: z.literal("project"),
            models: z.array(z.object({
              model: z.string(),
              requestsPerMinute: z.number().nullable(),
              tokensPerMinute: z.number().nullable(),
            })),
          }).nullable(),
          cost: z.object({
            scope: z.literal("project"),
            amount: z.number(),
            currency: z.string(),
            startTime: z.string(),
            endTime: z.string(),
          }).nullable(),
          balance: z.unknown().nullable(),
          status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
          message: z.string().nullable(),
        }),
      ),
    }),
  ),
  adminHealth: contract(nothing, z.object({
    status: z.enum(["UP", "DEGRADED", "UNKNOWN"]), checkedAt: z.string(), scope: z.string(),
    checks: z.array(z.object({ id: z.string(), name: z.string(), status: z.enum(["UP","DOWN","WARNING","UNKNOWN","DISABLED"]), latencyMs: z.number().nullable(), message: z.string(), action: z.string().nullable() })),
    jvm: z.object({ usedBytes: z.number(), maxBytes: z.number(), uptimeSeconds: z.number() }),
    storage: z.object({ totalBytes: z.number().optional(), freeBytes: z.number().optional() }),
  })),
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
