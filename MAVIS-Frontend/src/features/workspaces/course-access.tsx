"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  Copy,
  History,
  KeyRound,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DetailPanel } from "@/components/shared/data";
import { FormField } from "@/components/shared/forms";
import { useApi } from "@/hooks/use-api";
import { ApiError as ProxyError, api } from "@/lib/mainflow-api";
import { ApiError, backendErrorCode, fromStatus, publicErrorCode } from "@/lib/errors/api-error";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatCourseLabTitle } from "@/lib/format/course-display";
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

const UUID_SEGMENT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidSegment(value: string | null | undefined): boolean {
  return Boolean(value && UUID_SEGMENT_RE.test(value));
}

const roadmapKey = (workspaceId: string) => ["api", "course-roadmap", workspaceId];
const passkeyKey = (workspaceId: string) => ["api", "course-passkey", workspaceId];
const passkeysKey = (workspaceId: string) => ["api", "course-passkeys", workspaceId];
const essaysKey = (workspaceId: string) => ["api", "course-essays", workspaceId];

async function courseApi<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ProxyError) {
      const code =
        publicErrorCode(error.errorCode) ?? backendErrorCode(path, error.status, error.message);
      if (code) throw new ApiError(fromStatus(error.status).kind, error.status, code);
      throw fromStatus(error.status);
    }
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
      courseApi<Roadmap>(`workspaces/${encodeURIComponent(workspaceId)}/course-roadmap`, { signal }),
    enabled: client.mode === "backend" && isUuidSegment(workspaceId),
    refetchOnWindowFocus: true,
  });
}

export function useCoursePasskeys(workspaceId: string, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: passkeysKey(workspaceId),
    queryFn: ({ signal }) =>
      courseApi<PasskeyItem[]>(`workspaces/${encodeURIComponent(workspaceId)}/course-passkeys`, { signal }),
    enabled: client.mode === "backend" && isUuidSegment(workspaceId) && enabled,
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
    onSuccess: (created) => {
      cache.setQueryData<PasskeyItem[]>(passkeysKey(workspaceId), (previous) => [
        created,
        ...(previous ?? [])
          .filter((item) => item.id !== created.id)
          .map((item) =>
            item.active && !item.revokedAt
              ? { ...item, active: false, revokedAt: created.createdAt }
              : item,
          ),
      ]);
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
    onSuccess: (updated) => {
      cache.setQueryData<PasskeyItem[]>(passkeysKey(workspaceId), (prev) =>
        prev ? prev.map((item) => (item.id === updated.id ? updated : item)) : prev,
      );
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
    onSuccess: (_data, deletedId) => {
      cache.setQueryData<PasskeyItem[]>(passkeysKey(workspaceId), (prev) =>
        prev ? prev.filter((item) => item.id !== deletedId) : prev,
      );
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
      courseApi<CourseEssaySubmission[]>(`workspaces/${encodeURIComponent(workspaceId)}/course-essays`, { signal }),
    enabled: client.mode === "backend" && isUuidSegment(workspaceId) && enabled,
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

export function usePublishedCourse(workspaceId: string, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "course-published", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<PublishedCourse>(`workspaces/${encodeURIComponent(workspaceId)}/course/published`, { signal }),
    enabled: client.mode === "backend" && isUuidSegment(workspaceId) && enabled,
  });
}

export function useCourseAuthoring(workspaceId: string, enabled = true) {
  const client = useApi();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["api", "course-authoring", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<AuthoringCourse>(`workspaces/${encodeURIComponent(workspaceId)}/course`, { signal }),
    enabled: client.mode === "backend" && isUuidSegment(workspaceId) && enabled,
    retry: false,
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
    onSuccess: (publishedRes) => {
      cache.setQueryData<AuthoringCourse>(["api", "course-authoring", workspaceId], (prev) =>
        prev
          ? {
              ...prev,
              status: "PUBLISHED",
              publishedVersion: publishedRes.version,
            }
          : prev,
      );
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
    enabled:
      client.mode === "backend" &&
      Boolean(workspaceId) &&
      enabled &&
      Boolean(query.data?.id) &&
      (query.data?.publishedVersion ?? 0) > 0,
    retry: false,
  });
  const published = useQuery({
    queryKey: ["api", "course-published", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<PublishedCourse>(`workspaces/${workspaceId}/course/published`, { signal }),
    enabled:
      client.mode === "backend" &&
      Boolean(workspaceId) &&
      enabled &&
      (query.data?.publishedVersion ?? 0) > 0,
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
  properties?: Record<string, unknown> | null;
};

export type StudentLabReferenceRelationship = {
  id: string;
  sourceElementId: string;
  sourceName: string | null;
  targetElementId: string;
  targetName: string | null;
  relationType: string;
  originLayer: string | null;
  properties?: Record<string, unknown> | null;
};

export type StudentLabReferenceEvidence = {
  id: string;
  elementId?: string | null;
  relationshipId: string | null;
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
  projectName?: string | null;
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
  failureReason?: string | null;
  diagnostics?: string[] | null;
  createdAt: string | null;
};

export type StudentLabLatestReview = {
  submissionId: string;
  revision: number;
  status: string;
  score: number | null;
  scoreTenScale?: number | null;
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
    latestCorrectCount?: number | null;
    latestSubmittedAt?: string | null;
    bestPassedCorrectCount?: number | null;
    questions?: Array<{ id?: string; prompt?: string }> | null;
    runtimeUnlocked: boolean;
  } | null;
  studioSessions: StudentLabStudioSession[];
  latestSubmission: {
    id: string;
    submittedAt?: string | null;
    frozenQuizCorrectCount?: number | null;
    frozenQuizTotalQuestions?: number | null;
    frozenQuizPassPercent?: number | null;
    submissionNotes?: string | null;
    studentSnapshots?: Array<{ writtenExplanation?: string | null }> | null;
  } | null;
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
  const validIds = UUID_SEGMENT_RE.test(workspaceId) && UUID_SEGMENT_RE.test(assignmentId);
  return useQuery({
    queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
    queryFn: ({ signal }) =>
      courseApi<StudentLabContext>(
        `workspaces/${encodeURIComponent(workspaceId)}/course-labs/${encodeURIComponent(assignmentId)}/student-context`,
        { signal },
      ),
    enabled: client.mode === "backend" && enabled && validIds,
    refetchOnMount: "always",
    retry: false,
  });
}

export function useStudentLabStudioSessions(
  workspaceId: string,
  assignmentId: string,
  enabled = true,
) {
  const client = useApi();
  const validIds = UUID_SEGMENT_RE.test(workspaceId) && UUID_SEGMENT_RE.test(assignmentId);
  return useQuery({
    queryKey: ["api", "student-lab-studio-sessions", workspaceId, assignmentId],
    queryFn: ({ signal }) =>
      courseApi<StudentLabStudioSession[]>(
        `workspaces/${encodeURIComponent(workspaceId)}/course-labs/${encodeURIComponent(assignmentId)}/studio-sessions`,
        { signal },
      ),
    enabled: client.mode === "backend" && enabled && validIds,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const items = query.state.data;
      if (!Array.isArray(items)) return false;
      const hasInFlight = items.some((item) =>
        [
          "PENDING",
          "QUEUED",
          "READY_FOR_DISPATCH",
          "APPROVED",
          "ALLOCATED",
          "RUNNING",
          "CANCELLING",
        ].includes(String(item.executionStatus ?? "").toUpperCase()),
      );
      return hasInFlight ? 2500 : false;
    },
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
  projectId?: string;
  blockCount?: number;
  connectionCount?: number;
  topologyRevision: number;
  studioFrozen?: boolean;
  containerCount?: number;
  linkCount?: number;
  message?: string;
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
      void cache.invalidateQueries({ queryKey: ["api", "runtimeConfiguration"] });
      void cache.invalidateQueries({ queryKey: ["api", "runtime-setup-readiness"] });
      void cache.invalidateQueries({
        queryKey: ["api", "studio-exercise", workspaceId, assignmentId],
      });
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
      });
    },
  });
}

import {
  normalizeWorkspaceGradebook,
  type GradebookCell,
  type GradebookLab,
  type GradebookStudent,
  type WorkspaceGradebook,
} from "@/lib/format/gradebook";

export {
  normalizeWorkspaceGradebook,
  type GradebookCell,
  type GradebookLab,
  type GradebookStudent,
  type WorkspaceGradebook,
};

export function useWorkspaceGradebook(workspaceId: string, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "workspace-gradebook", workspaceId],
    queryFn: async ({ signal }) => {
      const raw = await courseApi<unknown>(`workspaces/${workspaceId}/gradebook`, { signal });
      return normalizeWorkspaceGradebook(raw);
    },
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
  readinessGrade?: "READY" | "NEEDS_FIX" | "BLOCKED" | undefined;
  traceCoveragePercent?: number | null | undefined;
  verifiedSessionId?: string | null | undefined;
  remediationSteps?: string[] | undefined;
  suggestedContractYaml?: string | null | undefined;
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
    onSuccess: async ({ workspaceId }) => {
      setCode("");
      setRequestId(undefined);
      await cache.refetchQueries({ queryKey: ["api", "workspaces"] });
      router.push(`/${destination}?workspace=${encodeURIComponent(workspaceId)}`);
    },
  });
  if (client.mode !== "backend") return null;
  const status = redeem.error instanceof ApiError ? redeem.error.status : undefined;
  const formatInvalid = code.length > 0 && !/^[A-Za-z0-9_-]{4,32}$/.test(code);
  return (
    <DetailPanel title={t("Join a class with Passkey", "Tham gia lớp bằng Passkey")}>
      <p className="text-xs text-muted-foreground">
        {t(
          "Enter the 4–32 character Passkey issued by your Lecturer to enroll immediately.",
          "Nhập mã Passkey (4–32 ký tự) do Giảng viên cấp để ghi danh ngay vào lớp học.",
        )}
      </p>
      <form
        noValidate
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length < 4 || code.length > 32 || !/^[A-Za-z0-9_-]{4,32}$/.test(code)) {
            return;
          }
          const id = requestId ?? crypto.randomUUID();
          setRequestId(id);
          redeem.mutate(id);
        }}
      >
        <div className="min-w-[260px] flex-1 max-w-md">
          <FormField
            label="Passkey"
            hint={t("4–32 characters (letters, digits, - or _).", "Từ 4–32 ký tự (chữ cái, số, - hoặc _).")}
          >
            {(props) => (
              <Input
                {...props}
                required
                className="font-mono tracking-wider"
                placeholder={t("Enter class passkey", "Nhập mã Passkey của lớp")}
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
        <Button disabled={redeem.isPending || code.length < 4 || code.length > 32 || formatInvalid}>
          {redeem.isPending ? t("Joining…", "Đang tham gia…") : t("Join class", "Vào lớp")}
        </Button>
      </form>
      {formatInvalid && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {t(
            "Passkey must be 4–32 characters using only letters, numbers, hyphens (-), or underscores (_).",
            "Mã Passkey phải gồm 4–32 ký tự và chỉ chứa chữ cái, chữ số, dấu gạch ngang (-) hoặc gạch dưới (_).",
          )}
        </p>
      )}
      {redeem.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {status === 409
            ? t(
                "You are already enrolled in this class. Open My Courses to continue learning.",
                "Bạn đã ghi danh vào lớp học này rồi. Hãy mở Khóa học của tôi để tiếp tục học.",
              )
            : status === 400 || status === 422 || status === 404
              ? t(
                  "This passkey is invalid, expired, or revoked. Please check with your Lecturer and try again.",
                  "Mã ghi danh không hợp lệ, đã hết hạn hoặc đã bị thu hồi. Vui lòng kiểm tra lại với Giảng viên.",
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
          <span className="mavis-tabular font-semibold text-primary">
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
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 bg-background p-3.5 transition-colors ${
                lab.state === "PASSED"
                  ? "border-l-emerald-500 hover:border-emerald-500/50"
                  : lab.state === "UNLOCKED"
                    ? "border-l-primary hover:border-primary/50"
                    : "border-l-muted-foreground/30 opacity-80"
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/40 font-mono text-xs font-semibold">
                  {labOrder}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {formatCourseLabTitle(lab.title, lab.position, lab.assignmentId)}
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
                            "Unlocked — complete Theory, Reverse BFS, Quiz & Submit inside Lab.",
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

const PASSKEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateStructuredPasskey(): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += PASSKEY_ALPHABET[Math.floor(Math.random() * PASSKEY_ALPHABET.length)];
  }
  return `MAVIS-${suffix}`;
}

function isUsablePasskey(item: PasskeyItem): boolean {
  return (
    item.active &&
    Boolean(item.code) &&
    !item.revokedAt &&
    new Date(item.expiresAt).getTime() > Date.now() &&
    (item.maxUses == null || item.usedCount < item.maxUses)
  );
}

export function CoursePasskey({ workspaceId }: { workspaceId: string }) {
  const t = useCourseText();
  const passkeys = useCoursePasskeys(workspaceId);
  const createKey = useCreateCoursePasskey(workspaceId);
  const status = useQuery({
    queryKey: passkeyKey(workspaceId),
    queryFn: ({ signal }) =>
      courseApi<KeyStatus>(`workspaces/${workspaceId}/course-passkey`, { signal }),
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [validHours, setValidHours] = useState(720);
  const [maxUses, setMaxUses] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const list = [...(passkeys.data ?? [])].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const current = list.find(isUsablePasskey) ?? null;
  const history = list.filter((item) => item.id !== current?.id);
  const historyPageCount = Math.max(1, Math.ceil(history.length / 3));
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistory = history.slice((safeHistoryPage - 1) * 3, safeHistoryPage * 3);
  const mutating = createKey.isPending;
  const maxUsesInvalid =
    maxUses.trim() !== "" &&
    (!Number.isInteger(Number(maxUses)) || Number(maxUses) < 1);

  const openDialog = () => {
    setValidHours(720);
    setMaxUses("");
    setDialogOpen(true);
  };

  const handleCopy = (item: PasskeyItem) => {
    if (!item.code) return;
    const confirmCopied = () => {
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((value) => (value === item.id ? null : value)), 2200);
    };
    const fallbackCopy = () => {
      const input = document.createElement("textarea");
      input.value = item.code ?? "";
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      confirmCopied();
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(item.code).then(confirmCopied, fallbackCopy);
    } else {
      fallbackCopy();
    }
  };

  const submitDialog = async () => {
    const parsedMaxUses = Number(maxUses);
    if (maxUsesInvalid) return;
    const boundedHours = Math.min(8760, Math.max(1, validHours || 720));
    try {
      await createKey.mutateAsync({
        customCode: generateStructuredPasskey(),
        validHours: boundedHours,
        ...(maxUses.trim() ? { maxUses: parsedMaxUses } : {}),
      });
      toast.success(t("A new Passkey is ready.", "Passkey mới đã sẵn sàng."));
      setHistoryPage(1);
      setDialogOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("Could not update the Passkey.", "Không thể cập nhật Passkey."),
      );
    }
  };

  const mutationError = createKey.error;

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="size-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            {t("Class Passkey", "Passkey lớp học")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "Share the current Passkey so students can enroll in this class.",
              "Chia sẻ Passkey hiện tại để sinh viên ghi danh vào lớp.",
            )}
          </p>
        </div>
        {status.data && (
          <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("Enrolled", "Đã ghi danh")}: {status.data.enrolledStudents}/
            {status.data.maxStudents ?? t("Unlimited", "Không giới hạn")}
          </span>
        )}
      </div>

      {passkeys.isPending ? (
        <p role="status" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("Loading Passkey…", "Đang tải Passkey…")}
        </p>
      ) : current ? (
        <div className="rounded-xl border bg-muted/15 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(current)}
                  className="inline-flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 font-mono text-base font-bold tracking-wide text-teal-700 transition hover:bg-teal-500/20 dark:text-teal-300"
                >
                  {copiedId === current.id ? t("Copied!", "Đã sao chép!") : current.code}
                  {copiedId === current.id ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </button>
                <Badge variant="success">{t("Valid", "Còn hạn")}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {t("Expires", "Hết hạn")}: {new Date(current.expiresAt).toLocaleString()}
                </span>
                <span>
                  {t("Used", "Đã sử dụng")}: {current.usedCount}/
                  {current.maxUses ?? t("Unlimited", "Không giới hạn")}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openDialog}>
                <RefreshCw className="mr-1.5 size-4" aria-hidden="true" />
                {t("Create new Passkey", "Tạo Passkey mới")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-7 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold">{t("No current Passkey", "Chưa có Passkey")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Create a Passkey so students can enroll in this class.",
                "Tạo Passkey để sinh viên có thể ghi danh vào lớp.",
              )}
            </p>
          </div>
          <Button type="button" onClick={openDialog}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            {t("Create Passkey", "Tạo Passkey")}
          </Button>
        </div>
      )}

      {mutationError && (
        <p role="alert" className="text-sm text-destructive">
          {mutationError.message ||
            t("Could not update the Passkey.", "Không thể cập nhật Passkey.")}
        </p>
      )}

      {history.length > 0 && (
        <details className="group rounded-xl border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
            <span className="inline-flex items-center gap-2">
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
              {t("Passkey history", "Lịch sử Passkey")} ({history.length})
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">
              {t("Show", "Xem")}
            </span>
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("Passkey", "Mã Passkey")}</th>
                  <th className="px-4 py-2 font-medium">{t("Period", "Thời gian sử dụng")}</th>
                  <th className="px-4 py-2 font-medium">{t("Usage", "Đã dùng")}</th>
                  <th className="px-4 py-2 font-medium">{t("Status", "Trạng thái")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleHistory.map((item) => {
                  const expired = new Date(item.expiresAt).getTime() <= Date.now();
                  const exhausted = item.maxUses != null && item.usedCount >= item.maxUses;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-mono font-semibold">{item.code ?? "••••"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()} – {new Date(item.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {item.usedCount}/{item.maxUses ?? "∞"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {expired
                          ? t("Expired", "Đã hết hạn")
                          : exhausted
                            ? t("Usage limit reached", "Đã hết lượt")
                            : t("Replaced", "Đã thay thế")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {historyPageCount > 1 && (
              <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={safeHistoryPage === 1}
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                >
                  {t("Previous", "Trước")}
                </Button>
                <span className="min-w-16 text-center text-xs text-muted-foreground">
                  {safeHistoryPage}/{historyPageCount}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={safeHistoryPage === historyPageCount}
                  onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
                >
                  {t("Next", "Sau")}
                </Button>
              </div>
            )}
          </div>
        </details>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {current
                ? t("Create new Passkey", "Tạo Passkey mới")
                : t("Create Passkey", "Tạo Passkey")}
            </DialogTitle>
            <DialogDescription>
              {current
                ? t(
                    "The current Passkey will stop working immediately. Students who have not enrolled must use the new code.",
                    "Passkey hiện tại sẽ mất hiệu lực ngay. Sinh viên chưa ghi danh phải sử dụng mã mới.",
                  )
                : t(
                    "Choose how long the Passkey remains valid and optionally limit enrollments.",
                    "Chọn thời hạn sử dụng và giới hạn số lượt ghi danh nếu cần.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("Validity", "Thời hạn")}</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { hours: 24, label: t("24 hours", "24 giờ") },
                  { hours: 168, label: t("7 days", "7 ngày") },
                  { hours: 720, label: t("30 days", "30 ngày") },
                ].map((option) => (
                  <Button
                    key={option.hours}
                    type="button"
                    variant={validHours === option.hours ? "default" : "outline"}
                    onClick={() => setValidHours(option.hours)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <FormField label={t("Custom duration (hours)", "Thời hạn tùy chỉnh (giờ)")}>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    max={8760}
                    value={validHours}
                    onChange={(event) => setValidHours(Number(event.target.value))}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t("Enrollment limit", "Giới hạn sinh viên")}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={10000}
                  aria-invalid={maxUsesInvalid || undefined}
                  className={
                    maxUsesInvalid
                      ? "border-destructive focus-visible:ring-destructive"
                      : undefined
                  }
                  placeholder={t("Unlimited", "Không giới hạn")}
                  value={maxUses}
                  onChange={(event) => setMaxUses(event.target.value)}
                />
              )}
            </FormField>
            {maxUsesInvalid && (
              <p role="alert" className="text-sm text-destructive">
                {t(
                  "Enter an integer of at least 1, or leave blank for unlimited.",
                  "Nhập số nguyên từ 1 trở lên, hoặc để trống nếu không giới hạn.",
                )}
              </p>
            )}
            {mutationError && (
              <p role="alert" className="text-sm text-destructive">
                {mutationError.message ||
                  t("Could not update the Passkey.", "Không thể cập nhật Passkey.")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t("Cancel", "Hủy")}
            </Button>
            <Button
              type="button"
              disabled={mutating || maxUsesInvalid}
              onClick={() => void submitDialog()}
            >
              {mutating
                ? t("Creating…", "Đang tạo…")
                : current
                  ? t("Create new Passkey", "Tạo Passkey mới")
                  : t("Create Passkey", "Tạo Passkey")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function PublishCourseLab({
  workspaceId,
  assignmentId,
  position,
  sessionId,
  canFreeze = true,
  topologyFrozen = false,
  freezeDisabledReason,
  publishBlockedReason,
  compact = false,
}: {
  workspaceId: string;
  assignmentId: string;
  position?: number | undefined;
  sessionId?: string | undefined;
  canFreeze?: boolean | undefined;
  topologyFrozen?: boolean | undefined;
  freezeDisabledReason?: string | undefined;
  publishBlockedReason?: string | undefined;
  compact?: boolean | undefined;
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
      void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] });
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
      <div className={compact ? "flex shrink-0 items-center gap-1.5" : "flex flex-wrap items-center gap-2"}>
        <span className={compact ? "hidden whitespace-nowrap text-xs font-medium 2xl:inline" : "text-sm font-medium"}>
          {t(`In class · Lab ${labPosition}`, `Trong lớp · Lab ${labPosition}`)}
        </span>
        {topologyFrozen || freeze.isSuccess ? (
          <Badge variant="success" className="shrink-0 whitespace-nowrap">
            {compact ? (
              <>
                <span className="hidden xl:inline">{t("Topology frozen", "Đã đóng băng topology")}</span>
                <span className="xl:hidden">{t("Frozen", "Đã khóa")}</span>
              </>
            ) : (
              t("Topology frozen", "Đã đóng băng topology")
            )}
          </Badge>
        ) : (
          canFreeze && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={compact ? "h-8 shrink-0 whitespace-nowrap px-2 text-xs" : undefined}
              disabled={freeze.isPending || Boolean(freezeDisabledReason)}
              title={freezeDisabledReason}
              onClick={() => {
                if (!freezeDisabledReason) freeze.mutate();
              }}
            >
              {freeze.isPending
                ? t("Freezing…", "Đang đóng băng…")
                : compact
                  ? t("Freeze topology", "Đóng băng")
                  : t("Freeze Studio topology", "Đóng băng topology Studio")}
            </Button>
          )
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
        disabled={publish.isPending || Boolean(publishBlockedReason)}
        title={publishBlockedReason}
        onClick={() => {
          if (publishBlockedReason) return;
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
          {publish.error.message ||
            t(
              "Could not add this Lab to the class. Check the pinned source and class status.",
              "Chưa thể thêm Lab vào lớp. Hãy kiểm tra nguồn đã ghim và trạng thái lớp.",
            )}
        </p>
      )}
    </div>
  );
}
