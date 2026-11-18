"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailPanel } from "@/components/shared/data";
import { FormField } from "@/components/shared/forms";
import { useApi } from "@/hooks/use-api";
import { ApiError as ProxyError, api } from "@/lib/mainflow-api";
import { ApiError, fromStatus } from "@/lib/errors/api-error";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Response } from "@/lib/api/contracts";

type Lab = {
  assignmentId: string;
  position: number;
  title: string;
  state: "LOCKED" | "UNLOCKED" | "PASSED";
  reason: "PREREQUISITE" | "COURSE_ARCHIVED" | null;
};
type Roadmap = {
  guided: boolean;
  enrollmentStatus: "ENROLLED" | "IN_PROGRESS" | "COMPLETED" | null;
  labs: Lab[];
};
type KeyStatus = {
  active: boolean;
  expiresAt: string | null;
  maxStudents: number | null;
  enrolledStudents: number;
  code?: string | null | undefined;
};
type IssuedKey = { code: string; expiresAt: string };

export type PasskeyItem = {
  id: string;
  workspaceId: string;
  code: string | null;
  label: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
};

export type CourseEssaySubmission = {
  id: string;
  workspaceId: string;
  courseItemId: string;
  itemTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  answerMarkdown: string;
  status: "SUBMITTED" | "GRADED" | "RETURNED";
  score: number | null;
  feedback: string | null;
  gradedBy: string | null;
  submittedAt: string;
  gradedAt: string | null;
};

const roadmapKey = (workspaceId: string) => ["api", "course-roadmap", workspaceId];
const passkeyKey = (workspaceId: string) => ["api", "course-passkey", workspaceId];
const passkeysKey = (workspaceId: string) => ["api", "course-passkeys", workspaceId];
const essaysKey = (workspaceId: string) => ["api", "course-essays", workspaceId];

async function courseApi<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ProxyError) throw fromStatus(error.status);
    throw error;
  }
}

function useCourseText() {
  const { locale } = useLocale();
  return (en: string, vi: string) => (locale === "vi" ? vi : en);
}

export function useCourseRoadmap(workspaceId: string) {
  const client = useApi();
  return useQuery({
    queryKey: roadmapKey(workspaceId),
    queryFn: ({ signal }) =>
      courseApi<Roadmap>(`workspaces/${workspaceId}/course-roadmap`, { signal }),
    enabled: client.mode === "backend" && !!workspaceId,
    refetchOnWindowFocus: true,
  });
}

export function useCoursePasskeys(workspaceId: string, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: passkeysKey(workspaceId),
    queryFn: ({ signal }) =>
      courseApi<PasskeyItem[]>(`workspaces/${workspaceId}/course-passkeys`, { signal }),
    enabled: client.mode === "backend" && Boolean(workspaceId) && enabled,
    retry: false,
  });
}

export function useCreateCoursePasskey(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      customCode?: string | undefined;
      label?: string | undefined;
      validHours?: number | undefined;
      maxUses?: number | undefined;
    }) =>
      courseApi<PasskeyItem>(`workspaces/${workspaceId}/course-passkeys`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: passkeysKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: passkeyKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "workspaces"] });
    },
  });
}

export function useUpdateCoursePasskey(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({
      passkeyId,
      ...body
    }: {
      passkeyId: string;
      customCode?: string | undefined;
      label?: string | undefined;
      validHours?: number | undefined;
      maxUses?: number | undefined;
      active?: boolean | undefined;
    }) =>
      courseApi<PasskeyItem>(`workspaces/${workspaceId}/course-passkeys/${passkeyId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: passkeysKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: passkeyKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
}

export function useDeleteCoursePasskey(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (passkeyId: string) =>
      courseApi<null>(`workspaces/${workspaceId}/course-passkeys/${passkeyId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: passkeysKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: passkeyKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
}

export function useCourseEssays(workspaceId: string, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: essaysKey(workspaceId),
    queryFn: ({ signal }) =>
      courseApi<CourseEssaySubmission[]>(`workspaces/${workspaceId}/course-essays`, { signal }),
    enabled: client.mode === "backend" && Boolean(workspaceId) && enabled,
    retry: false,
  });
}

export function useSubmitCourseEssay(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, answerMarkdown }: { itemId: string; answerMarkdown: string }) =>
      courseApi<CourseEssaySubmission>(
        `workspaces/${workspaceId}/course-items/${itemId}/essay-submissions`,
        {
          method: "POST",
          body: JSON.stringify({ answerMarkdown }),
        },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: essaysKey(workspaceId) });
    },
  });
}

export function useGradeCourseEssay(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({
      submissionId,
      score,
      feedback,
      status = "GRADED",
    }: {
      submissionId: string;
      score: number;
      feedback: string;
      status?: "GRADED" | "RETURNED" | undefined;
    }) =>
      courseApi<CourseEssaySubmission>(
        `workspaces/${workspaceId}/essay-submissions/${submissionId}/grade`,
        {
          method: "PUT",
          body: JSON.stringify({ score, feedback, status }),
        },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: essaysKey(workspaceId) });
    },
  });
}

export type AuthoringCourse = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  draftRevision: number;
  publishedVersion: number;
  modules: AuthoringModule[];
};
type AuthoringModule = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  prerequisiteModuleId: string | null;
  items: AuthoringItem[];
};
type AuthoringItem = {
  id: string;
  type: "THEORY" | "QUIZ" | "ESSAY" | "STATIC_LAB" | "IMPACT_LAB" | "RUNTIME_LAB";
  title: string;
  description: string | null;
  position: number;
  assignmentId: string | null;
  content: Record<string, unknown>;
  required: boolean;
};

export type PublishedCourse = {
  courseId: string;
  version: number;
  draftRevision: number;
  snapshotDigest: string;
  publishedAt: string;
  snapshot: {
    title: string;
    description: string | null;
    modules: Array<{
      id: string;
      title: string;
      description: string | null;
      position: number;
      prerequisiteModuleId: string | null;
      items: Array<{
        id: string;
        type: string;
        title: string;
        description: string | null;
        position: number;
        assignmentId: string | null;
        content: Record<string, unknown>;
        required: boolean;
      }>;
    }>;
  };
};

export function usePublishedCourse(workspaceId: string) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "course-published", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<PublishedCourse>(`workspaces/${workspaceId}/course/published`, { signal }),
    enabled: client.mode === "backend" && Boolean(workspaceId),
  });
}

export function useCourseAuthoring(workspaceId: string, enabled = true) {
  const client = useApi();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["api", "course-authoring", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course`, { signal }),
    enabled: client.mode === "backend" && Boolean(workspaceId) && enabled,
  });
  const save = useMutation({
    mutationFn: (body: { title: string; description: string }) =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course/draft`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => cache.setQueryData(["api", "course-authoring", workspaceId], data),
  });
  const addModule = useMutation({
    mutationFn: (body: { title: string; description?: string; prerequisiteModuleId?: string }) =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course/modules`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => cache.setQueryData(["api", "course-authoring", workspaceId], data),
  });
  const addItem = useMutation({
    mutationFn: ({
      moduleId,
      ...body
    }: {
      moduleId: string;
      type: AuthoringItem["type"];
      title: string;
      description?: string;
      required?: boolean;
      assignmentId?: string;
      content?: Record<string, unknown>;
    }) =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course/modules/${moduleId}/items`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => cache.setQueryData(["api", "course-authoring", workspaceId], data),
  });
  const publish = useMutation({
    mutationFn: () =>
      courseApi<{ courseId: string; version: number; snapshotDigest: string }>(
        `workspaces/${workspaceId}/course/publish`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-versions", workspaceId] });
    },
  });
  const versions = useQuery({
    queryKey: ["api", "course-versions", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<
        Array<{
          version: number;
          draftRevision: number;
          snapshotDigest: string;
          publishedAt: string;
        }>
      >(`workspaces/${workspaceId}/course/versions`, { signal }),
    enabled: client.mode === "backend" && Boolean(workspaceId) && enabled,
  });
  const published = useQuery({
    queryKey: ["api", "course-published", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<PublishedCourse>(`workspaces/${workspaceId}/course/published`, { signal }),
    enabled: client.mode === "backend" && Boolean(workspaceId) && enabled,
  });
  const keepCourse = (data: AuthoringCourse) => {
    cache.setQueryData(["api", "course-authoring", workspaceId], data);
    return data;
  };
  const updateModule = useMutation({
    mutationFn: ({
      moduleId,
      ...body
    }: {
      moduleId: string;
      title: string;
      description?: string;
      prerequisiteModuleId?: string;
    }) =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course/modules/${moduleId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }).then(keepCourse),
  });
  const moveModule = useMutation({
    mutationFn: ({ moduleId, direction }: { moduleId: string; direction: "UP" | "DOWN" }) =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course/modules/${moduleId}/move`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      }).then(keepCourse),
  });
  const updateItem = useMutation({
    mutationFn: ({
      moduleId,
      itemId,
      ...body
    }: {
      moduleId: string;
      itemId: string;
      type: AuthoringItem["type"];
      title: string;
      description?: string;
      required?: boolean;
      assignmentId?: string;
      content?: Record<string, unknown>;
    }) =>
      courseApi<AuthoringCourse>(
        `workspaces/${workspaceId}/course/modules/${moduleId}/items/${itemId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        },
      ).then(keepCourse),
  });
  const moveItem = useMutation({
    mutationFn: ({
      moduleId,
      itemId,
      direction,
    }: {
      moduleId: string;
      itemId: string;
      direction: "UP" | "DOWN";
    }) =>
      courseApi<AuthoringCourse>(
        `workspaces/${workspaceId}/course/modules/${moduleId}/items/${itemId}/move`,
        {
          method: "POST",
          body: JSON.stringify({ direction }),
        },
      ).then(keepCourse),
  });
  const deleteItem = useMutation({
    mutationFn: ({ moduleId, itemId }: { moduleId: string; itemId: string }) =>
      courseApi<AuthoringCourse>(
        `workspaces/${workspaceId}/course/modules/${moduleId}/items/${itemId}`,
        {
          method: "DELETE",
        },
      ).then(keepCourse),
  });
  const deleteModule = useMutation({
    mutationFn: ({ moduleId }: { moduleId: string }) =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course/modules/${moduleId}`, {
        method: "DELETE",
      }).then(keepCourse),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-roadmap", workspaceId] });
    },
  });
  const startDraft = useMutation({
    mutationFn: () =>
      courseApi<AuthoringCourse>(`workspaces/${workspaceId}/course/draft`, { method: "POST" }),
    onSuccess: (data) => {
      cache.setQueryData(["api", "course-authoring", workspaceId], data);
      void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-versions", workspaceId] });
    },
  });
  return {
    ...query,
    save,
    addModule,
    addItem,
    updateModule,
    moveModule,
    deleteModule,
    updateItem,
    moveItem,
    deleteItem,
    publish,
    versions,
    published,
    startDraft,
  };
}

export type CourseSetupReference = {
  projectId: string | null;
  projectName: string | null;
  modelId: string | null;
  snapshotId: string | null;
  modelRevision: number;
  referenceReady: boolean;
  runtimeConfigured: boolean;
  runtimeMatchesSource: boolean;
  runtimeRevision: number;
  applications: string[];
  blockCount: number;
  connectionCount: number;
  topologyConfigured: boolean;
};
export type CourseSetupLab = {
  assignmentId: string;
  position: number;
  title: string;
  published: boolean;
  referenceReady: boolean;
  requiresRuntime: boolean;
  studioReady: boolean;
  topologyFrozen: boolean;
  quizPublished: boolean;
  quizVersion: number;
  state: string;
};
export type CourseSetupStep = {
  id: string;
  state: "DONE" | "PARTIAL" | "ACTION" | "BLOCKED";
  detail: string;
};
export type CourseSetup = {
  workspaceId: string;
  workspaceName: string;
  status: string;
  courseMode: boolean;
  reference: CourseSetupReference;
  labs: CourseSetupLab[];
  passkey: {
    active: boolean;
    expiresAt: string | null;
    maxStudents: number | null;
    enrolledStudents: number;
  };
  steps: CourseSetupStep[];
  nextAction: string;
  previewAssignmentId: string | null;
};

export type StudentLabReferenceDiagram = {
  id: string;
  notation: string;
  level: string;
  layoutJson: Record<string, unknown> | null;
  mermaidDsl: string | null;
};

export type StudentLabReferenceElement = {
  id: string;
  elementType: string;
  name: string;
  scope: string;
  languageStack: string | null;
  parentElementId: string | null;
  status: string | null;
};

export type StudentLabReferenceRelationship = {
  id: string;
  sourceElementId: string;
  sourceName: string | null;
  targetElementId: string;
  targetName: string | null;
  relationType: string;
  originLayer: string | null;
};

export type StudentLabReferenceEvidence = {
  id: string;
  relationshipId: string;
  locator: string | null;
  sourceType: string | null;
  excerpt: string | null;
  adapterVersion: string | null;
};

export type StudentLabReferenceFinding = {
  id: string;
  ruleId: string;
  severity: string;
  status: string;
  message: string;
};

export type StudentLabReferenceEvaluation = {
  id: string;
  ruleSetVersion: string | null;
  summaryMetrics: Record<string, unknown> | null;
  findings: StudentLabReferenceFinding[];
};

export type StudentLabReferenceArchitecture = {
  projectId: string;
  snapshotId: string;
  modelVersionId: string;
  revision: number | null;
  diagrams: StudentLabReferenceDiagram[];
  elements: StudentLabReferenceElement[];
  relationships: StudentLabReferenceRelationship[];
  evidences: StudentLabReferenceEvidence[];
  evaluation: StudentLabReferenceEvaluation | null;
};

export type StudentLabStudioSession = {
  id: string;
  projectId: string;
  sourceSnapshotId: string;
  assignmentId: string | null;
  scenarioName: string | null;
  executionStatus: string | null;
  traceStatus: string | null;
  capturedSpanCount: number | null;
  studioVerified: boolean;
  createdAt: string | null;
};

export type StudentLabLatestReview = {
  submissionId: string;
  revision: number;
  status: string;
  score: number | null;
  summary: string | null;
  lecturerName: string | null;
  updatedAt: string | null;
  snapshotGrades?: Array<{
    snapshotId: string;
    title?: string;
    score: number;
    comment?: string | null;
  }> | null;
  labOutcome?: "PENDING" | "PASSED" | "NEEDS_REVISION" | null;
};

export type StudentLabContext = {
  assignment: Response<"assignments">[number] & { description?: string | null };
  referenceArchitecture: StudentLabReferenceArchitecture | null;
  quiz: {
    version: number;
    lesson: string;
    passPercent: number;
    passed: boolean;
    latestStatus: "PASSED" | "NEEDS_RETRY" | "NOT_ATTEMPTED" | null;
    runtimeUnlocked: boolean;
  } | null;
  studioSessions: StudentLabStudioSession[];
  latestSubmission: { id: string; submittedAt?: string | null } | null;
  latestReview: StudentLabLatestReview | null;
  studioExercise?: {
    baselineRequests?: Array<{ method?: string; path?: string; expectedStatus?: number | null }>;
    initialState?: { stoppedServices?: string[]; stoppedControllers?: string[] };
    allowedActions?: string[];
    successCriteria?: {
      maxErrorRatePercent?: number | null;
      maxP95Ms?: number | null;
      requiredTraceEdge?: { from?: string; to?: string } | null;
      minReplicas?: Array<{ service?: string; count?: number }>;
    };
    instructions?: string;
    revision?: number;
  } | null;
};

export function useStudentLabContext(workspaceId: string, assignmentId: string, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
    queryFn: ({ signal }) =>
      courseApi<StudentLabContext>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/student-context`,
        { signal },
      ),
    enabled: client.mode === "backend" && enabled && Boolean(workspaceId && assignmentId),
    retry: false,
  });
}

export function useStudentLabStudioSessions(
  workspaceId: string,
  assignmentId: string,
  enabled = true,
) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "student-lab-studio-sessions", workspaceId, assignmentId],
    queryFn: ({ signal }) =>
      courseApi<StudentLabStudioSession[]>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-sessions`,
        { signal },
      ),
    enabled: client.mode === "backend" && enabled && Boolean(workspaceId && assignmentId),
    retry: false,
  });
}

export function useStartLabStudioSession(workspaceId: string, assignmentId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () =>
      courseApi<StudentLabStudioSession>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-sessions`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
      });
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-studio-sessions", workspaceId, assignmentId],
      });
    },
  });
}

export function useBootstrapLabStudio(workspaceId: string, assignmentId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      courseApi<{ session: StudentLabStudioSession; studio: Record<string, unknown> }>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-sessions/${sessionId}/bootstrap-studio`,
        { method: "POST" },
      ),
    onSuccess: (_data, sessionId) => {
      void cache.invalidateQueries({ queryKey: ["api", "studioState", { sessionId }] });
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
      });
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-studio-sessions", workspaceId, assignmentId],
      });
    },
  });
}

export type AutoConfigureStudioResult = {
  assignmentId: string;
  projectId: string;
  topologyRevision: number;
  containerCount: number;
  linkCount: number;
  message: string;
};

export function useAutoConfigureStudio(workspaceId: string, assignmentId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () =>
      courseApi<AutoConfigureStudioResult>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/auto-configure-studio`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["api", "assignments"] });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] });
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
      });
    },
  });
}

export type GradebookLab = {
  assignmentId: string;
  title: string;
  labOrder: number | null;
  labMode: string;
};

export type GradebookCell = {
  assignmentId: string;
  quizBestScore: number | null;
  quizPassed: boolean;
  submissionId: string | null;
  submittedAt: string | null;
  reviewStatus: string | null;
  reviewScore: number | null;
  labOutcome: string | null;
};

export type GradebookStudent = {
  studentId: string;
  fullName: string;
  email: string;
  passedLabs: number;
  averageScore: number | null;
  cells: GradebookCell[];
};

export type WorkspaceGradebook = {
  workspaceId: string;
  workspaceName: string;
  labs: GradebookLab[];
  students: GradebookStudent[];
};

export function useWorkspaceGradebook(workspaceId: string, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "workspace-gradebook", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<WorkspaceGradebook>(`workspaces/${workspaceId}/gradebook`, { signal }),
    enabled: client.mode === "backend" && Boolean(workspaceId) && enabled,
  });
}

export function useCourseSetup(workspaceId: string) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "course-setup", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<CourseSetup>(`workspaces/${workspaceId}/course-setup`, { signal }),
    enabled: client.mode === "backend" && !!workspaceId,
    refetchOnWindowFocus: true,
  });
}

export type RuntimeSetupReadiness = {
  configured: boolean;
  preflightCompatible: boolean;
  runnerReady: boolean;
  revision: number;
  prerequisites: string[];
  warnings: string[];
  applications: string[];
  mappings: string[];
  detectedServices: string[];
  runnerIssues: string[];
  topology: Record<string, unknown> | null;
};

export function useRuntimeSetupReadiness(projectId: string | null) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "runtime-setup-readiness", projectId],
    queryFn: ({ signal }) =>
      courseApi<RuntimeSetupReadiness>(`analyzer/projects/${projectId}/runtime-setup-readiness`, {
        signal,
      }),
    enabled: client.mode === "backend" && !!projectId,
    refetchOnWindowFocus: true,
  });
}

export function CourseEnrollment({
  destination = "workspaces",
}: {
  destination?: "workspaces" | "roadmap" | "workspace-overview";
}) {
  const t = useCourseText();
  const client = useApi();
  const router = useRouter();
  const cache = useQueryClient();
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const redeem = useMutation({
    mutationFn: (id: string) =>
      courseApi<{ workspaceId: string }>("course-enrollments/redeem", {
        method: "POST",
        headers: { "Idempotency-Key": id },
        body: JSON.stringify({ code: code.trim() }),
      }),
    onSuccess: ({ workspaceId }) => {
      setCode("");
      setRequestId(undefined);
      void cache.invalidateQueries({ queryKey: ["api", "workspaces"] });
      router.push(`/${destination}?workspace=${encodeURIComponent(workspaceId)}`);
    },
  });
  if (client.mode !== "backend") return null;
  const status = redeem.error instanceof ApiError ? redeem.error.status : undefined;
  return (
    <DetailPanel title={t("Join a class with Passkey", "Tham gia lớp bằng Passkey")}>
      <p className="text-xs text-muted-foreground">
        {t(
          "Enter the 4–32 character Passkey issued by your Lecturer (e.g. JAVA2026) to enroll immediately.",
          "Nhập mã Passkey (4–32 ký tự, VD: JAVA2026) do Giảng viên cấp để ghi danh ngay vào lớp học.",
        )}
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const id = requestId ?? crypto.randomUUID();
          setRequestId(id);
          redeem.mutate(id);
        }}
      >
        <div className="min-w-[260px] flex-1 max-w-md">
          <FormField
            label="Passkey"
            hint={t("4–32 characters (letters, digits, - or _). Example: JAVA2026.", "Từ 4–32 ký tự (chữ, số, - hoặc _). Ví dụ: JAVA2026.")}
          >
            {(props) => (
              <Input
                {...props}
                required
                className="font-mono tracking-wider"
                placeholder="JAVA2026"
                pattern="[A-Za-z0-9_\-]{4,32}"
                minLength={4}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                disabled={redeem.isPending}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\s+/g, "").slice(0, 32));
                  setRequestId(undefined);
                  redeem.reset();
                }}
              />
            )}
          </FormField>
        </div>
        <Button disabled={redeem.isPending || code.length < 4 || code.length > 32}>
          {redeem.isPending ? t("Joining…", "Đang tham gia…") : t("Join class", "Vào lớp")}
        </Button>
      </form>
      {redeem.error && (
        <p role="alert" className="text-sm text-destructive">
          {status === 409
            ? t(
                "Check My Classes. You may already be enrolled.",
                "Hãy kiểm tra Lớp học của tôi. Bạn có thể đã ghi danh vào lớp này.",
              )
            : status === 400 || status === 422
              ? t(
                  "The Passkey is invalid or expired. Ask your lecturer for a current key.",
                  "Passkey không hợp lệ hoặc đã hết hạn. Hãy xin mã mới từ giảng viên.",
                )
              : t(
                  "Could not join the class. Please retry.",
                  "Chưa thể tham gia lớp. Vui lòng thử lại.",
                )}
        </p>
      )}
    </DetailPanel>
  );
}

export function CourseRoadmap({
  workspaceId,
  canManage,
  active,
}: {
  workspaceId: string;
  canManage: boolean;
  active: boolean;
}) {
  const t = useCourseText();
  const roadmap = useCourseRoadmap(workspaceId);
  if (roadmap.isError) {
    return (
      <Button variant="outline" onClick={() => void roadmap.refetch()}>
        {t("Retry loading lab roadmap", "Tải lại lộ trình Lab")}
      </Button>
    );
  }
  if (!roadmap.data?.guided) return null;
  const statusLabels = {
    ENROLLED: t("Enrolled", "Đã ghi danh"),
    IN_PROGRESS: t("In progress", "Đang học"),
    COMPLETED: t("Completed", "Đã hoàn thành"),
  };
  const passed = roadmap.data.labs.filter((lab) => lab.state === "PASSED").length;
  const total = roadmap.data.labs.length;
  const progress = total ? Math.round((passed / total) * 100) : 0;
  return (
    <DetailPanel title={t("Lab roadmap", "Lộ trình Lab")}>
      {roadmap.data.enrollmentStatus && (
        <p className="text-sm font-medium">{statusLabels[roadmap.data.enrollmentStatus]}</p>
      )}
      <div
        className="space-y-2 rounded-xl border bg-muted/20 p-3.5"
        aria-label={t("Course progress", "Tiến độ khóa học")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium">
          <span>{t("Course mastery progress", "Tiến độ hoàn thành khóa học")}</span>
          <span>
            {passed}/{total} {t("Labs passed", "Lab đã đạt")} ({progress}%)
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ol className="space-y-2.5">
        {roadmap.data.labs.map((lab) => {
          const labOrder = String(lab.position).padStart(2, "0");
          const stateBadge =
            lab.state === "PASSED"
              ? {
                  label: t("PASSED", "ĐÃ ĐẠT"),
                  cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                }
              : lab.state === "UNLOCKED"
                ? {
                    label: t("UNLOCKED", "ĐANG MỞ"),
                    cls: "border-primary/40 bg-primary/10 text-primary",
                  }
                : {
                    label: t("LOCKED", "ĐANG KHÓA"),
                    cls: "border-border bg-muted text-muted-foreground",
                  };
          return (
            <li
              key={lab.assignmentId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3.5 transition-colors hover:border-primary/30"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/40 font-mono text-xs font-semibold">
                  {labOrder}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      Lab {lab.position} · {lab.title}
                    </p>
                    <span
                      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${stateBadge.cls}`}
                    >
                      {stateBadge.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lab.state === "PASSED"
                      ? t(
                          "Passed — ready for review or re-inspection.",
                          "Đã đạt — có thể vào xem lại kiến trúc và hồ sơ bài làm.",
                        )
                      : lab.state === "UNLOCKED"
                        ? t(
                            "Unlocked — complete Theory, Reverse BFS, Quiz Gate & Submit inside Lab.",
                            "Đã mở — hoàn thành Lý thuyết, Lan truyền ngược, Quiz và Nộp bài trong Lab.",
                          )
                        : lab.reason === "COURSE_ARCHIVED"
                          ? t("Class archived", "Lớp đã lưu trữ")
                          : t(
                              "Pass the preceding labs to unlock.",
                              "Đạt các Lab trước để mở khóa.",
                            )}
                  </p>
                </div>
              </div>
              {active && lab.state !== "LOCKED" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={lab.state === "PASSED" ? "outline" : "default"}
                    size="sm"
                    asChild
                  >
                    <Link
                      href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.assignmentId)}&step=1`}
                    >
                      {lab.state === "PASSED"
                        ? t("Review Lab", "Xem lại Lab")
                        : t("Enter Lab", "Vào làm Lab")}
                    </Link>
                  </Button>
                  {!canManage && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.assignmentId)}`}
                      >
                        {t("Submissions", "Bài nộp")}
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {canManage && active && (
        <div id="course-passkey">
          <CoursePasskey workspaceId={workspaceId} />
        </div>
      )}
    </DetailPanel>
  );
}

export function CoursePasskey({ workspaceId }: { workspaceId: string }) {
  const t = useCourseText();
  const cache = useQueryClient();
  const path = `workspaces/${workspaceId}/course-passkey`;
  const [validHours, setValidHours] = useState(24);
  const [maxStudents, setMaxStudents] = useState(30);
  const [issued, setIssued] = useState<IssuedKey>();
  const [copied, setCopied] = useState(false);
  const status = useQuery({
    queryKey: passkeyKey(workspaceId),
    queryFn: ({ signal }) => courseApi<KeyStatus>(path, { signal }),
  });
  const change = useMutation<IssuedKey | null, Error, "issue" | "revoke">({
    mutationFn: (action: "issue" | "revoke") =>
      action === "issue"
        ? courseApi<IssuedKey>(path, {
            method: "POST",
            body: JSON.stringify({ validHours, maxStudents }),
          })
        : courseApi<null>(`${path}/revoke`, { method: "POST" }),
    onSuccess: (key) => {
      setIssued(key ?? undefined);
      setCopied(false);
      void cache.invalidateQueries({ queryKey: passkeyKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{t("Class Passkey", "Passkey của lớp")}</h3>
      {status.data?.active && status.data.expiresAt && (
        <p className="text-sm text-muted-foreground">
          {t("Expires", "Hết hạn")}{" "}
          <time dateTime={status.data.expiresAt}>
            {new Date(status.data.expiresAt).toLocaleString()}
          </time>
        </p>
      )}
      {status.data && (
        <p className="text-sm text-muted-foreground">
          {t("Enrollment", "Ghi danh")}: {status.data.enrolledStudents}/
          {status.data.maxStudents ?? t("Unlimited", "Không giới hạn")}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !status.data?.active ||
            window.confirm(t("Replace the active Passkey?", "Thay Passkey đang có hiệu lực?"))
          )
            change.mutate("issue");
        }}
      >
        <FormField label={t("Valid for (hours)", "Hiệu lực (giờ)")}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={168}
              required
              value={validHours || ""}
              onChange={(event) => setValidHours(Number(event.target.value))}
            />
          )}
        </FormField>
        <FormField label={t("Maximum students", "Sĩ số tối đa")}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={10000}
              required
              value={maxStudents || ""}
              onChange={(event) => setMaxStudents(Number(event.target.value))}
            />
          )}
        </FormField>
        <Button disabled={change.isPending || !status.data}>
          {status.data?.active
            ? t("Replace Passkey", "Đổi Passkey")
            : t("Issue Passkey", "Cấp Passkey")}
        </Button>
        {status.data?.active && (
          <Button
            type="button"
            variant="outline"
            disabled={change.isPending}
            onClick={() => {
              if (window.confirm(t("Revoke this Passkey?", "Thu hồi Passkey này?")))
                change.mutate("revoke");
            }}
          >
            {t("Revoke", "Thu hồi")}
          </Button>
        )}
      </form>
      {issued && (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <code className="select-all rounded bg-muted px-2 py-1">{issued.code}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(issued.code).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? t("Copied", "Đã sao chép") : t("Copy", "Sao chép")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("Copy the key before leaving this page.", "Hãy sao chép mã trước khi rời trang.")}
          </span>
        </div>
      )}
      {status.isError && (
        <Button type="button" variant="outline" onClick={() => void status.refetch()}>
          {t("Retry loading Passkey", "Tải lại Passkey")}
        </Button>
      )}
      {change.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            "Could not update the Passkey. Please retry.",
            "Chưa thể cập nhật Passkey. Vui lòng thử lại.",
          )}
        </p>
      )}
    </div>
  );
}

export function PublishCourseLab({
  workspaceId,
  assignmentId,
  position,
  sessionId,
}: {
  workspaceId: string;
  assignmentId: string;
  position?: number | undefined;
  sessionId?: string | undefined;
}) {
  const t = useCourseText();
  const cache = useQueryClient();
  const publish = useMutation({
    mutationFn: () =>
      courseApi<Lab>(`workspaces/${workspaceId}/course-labs/${assignmentId}/publish`, {
        method: "POST",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: roadmapKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "assignments"] });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
  const freeze = useMutation({
    mutationFn: () =>
      courseApi<Lab>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/freeze-topology${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: roadmapKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
  const labPosition = position ?? publish.data?.position;
  if (labPosition)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {t(`In class · Lab ${labPosition}`, `Trong lớp · Lab ${labPosition}`)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={freeze.isPending}
          onClick={() => freeze.mutate()}
        >
          {freeze.isPending
            ? t("Freezing…", "Đang đóng băng…")
            : t("Freeze Studio topology", "Đóng băng topology Studio")}
        </Button>
        {freeze.isSuccess && (
          <span role="status" className="text-xs text-success">
            {t("Topology frozen", "Đã đóng băng topology")}
          </span>
        )}
        {freeze.error && (
          <span role="alert" className="text-xs text-destructive">
            {freeze.error.message}
          </span>
        )}
      </div>
    );
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        disabled={publish.isPending}
        onClick={() => {
          if (
            window.confirm(
              t(
                "Add this Lab to the end of the class sequence? Students unlock it after the preceding Lab and use its pinned source.",
                "Thêm Lab này vào cuối thứ tự lớp? Sinh viên mở Lab sau khi đạt Lab trước và dùng nguồn đã ghim.",
              ),
            )
          )
            publish.mutate();
        }}
      >
        {t("Add to class", "Thêm vào lớp")}
      </Button>
      {publish.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            "Could not add this Lab to the class. Check the pinned source and class status.",
            "Chưa thể thêm Lab vào lớp. Hãy kiểm tra nguồn đã ghim và trạng thái lớp.",
          )}
        </p>
      )}
    </div>
  );
}

export function SeedCuratedCourseLabs({
  workspaceId,
  variant = "outline",
}: {
  workspaceId: string;
  variant?: "default" | "outline";
}) {
  const t = useCourseText();
  const cache = useQueryClient();
  const [activePreset, setActivePreset] = useState<"STANDARD_DEMO" | "FULL_CURRICULUM" | null>(
    null,
  );
  const seed = useMutation({
    mutationFn: (preset: "STANDARD_DEMO" | "FULL_CURRICULUM") => {
      setActivePreset(preset);
      return courseApi<Roadmap>(`workspaces/${workspaceId}/course-labs/seed-curated`, {
        method: "POST",
        body: JSON.stringify({ preset }),
      });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: roadmapKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "assignments"] });
      void cache.invalidateQueries({ queryKey: ["api", "projects"] });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-versions", workspaceId] });
    },
    onSettled: () => setActivePreset(null),
  });
  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={variant}
          disabled={seed.isPending}
          onClick={() => seed.mutate("STANDARD_DEMO")}
        >
          {seed.isPending && activePreset === "STANDARD_DEMO"
            ? t("Seeding Curated Labs…", "Đang khởi tạo Bộ Lab Chuẩn…")
            : t(
                "⚡ 1-Click Seed Curated Labs (Lab 01–03)",
                "⚡ Khởi tạo nhanh Bộ Lab Chuẩn (Lab 01–03)",
              )}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={seed.isPending}
          onClick={() => seed.mutate("FULL_CURRICULUM")}
        >
          {seed.isPending && activePreset === "FULL_CURRICULUM"
            ? t("Seeding Full 13-Lab Curriculum…", "Đang khởi tạo 13 Lab Giáo trình…")
            : t(
                "📚 Seed Full 12 Java + 1 C# Curriculum",
                "📚 Khởi tạo trọn bộ 13 Lab (12 Java + 1 C#)",
              )}
        </Button>
      </div>
      {seed.isSuccess && (
        <p role="status" className="text-xs text-success">
          {t(
            `Ready (${seed.data.labs.length} guided labs published).`,
            `Đã sẵn sàng (${seed.data.labs.length} Lab tuần tự đã công bố).`,
          )}
        </p>
      )}
      {seed.isError && (
        <p role="alert" className="text-xs text-destructive">
          {t(
            "Could not seed curated labs. Verify workspace status and lecturer permissions.",
            "Chưa thể khởi tạo Lab mẫu. Hãy kiểm tra trạng thái lớp và quyền giảng viên.",
          )}
        </p>
      )}
    </div>
  );
}
