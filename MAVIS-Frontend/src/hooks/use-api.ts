"use client";
import { useContext, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyNotificationRead } from "@/features/notifications/read-cache";
import { toast } from "sonner";
import { ApiContext, SelectionContext } from "@/providers/app-context";
import type { Operation, Request, Response } from "@/lib/api/contracts";
import { normalizeError } from "@/lib/errors/api-error";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import {
  mutationInvalidations,
  mutationScope,
  queryMatchesScope,
  terminalSignature,
} from "@/lib/api/cache-policy";
export function useApi() {
  const api = useContext(ApiContext);
  if (!api) throw new Error("AppProvider is required");
  return api;
}
export function useSelection() {
  const state = useContext(SelectionContext);
  if (!state) throw new Error("AppProvider is required");
  return state;
}
export function useApiQuery<K extends Operation>(
  operation: K,
  input: Request<K>,
  options: { enabled?: boolean; poll?: boolean; refreshMs?: number } = {},
) {
  const api = useApi();
  const client = useQueryClient();
  const query = useQuery<Response<K>, Error>({
    queryKey: ["api", operation, input],
    queryFn: ({ signal }) => api.execute(operation, input, signal),
    enabled: options.enabled ?? true,
    ...(operation === "session" ? { refetchOnWindowFocus: true } : {}),
    refetchInterval: options.refreshMs
      ? Math.max(10000, options.refreshMs)
      : options.poll
        ? (query) => {
            const data: unknown = query.state.data;
            const active = (value: unknown) => {
              if (!value || typeof value !== "object") return false;
              if ("executionStatus" in value)
                return [
                  "NOT_STARTED",
                  "PENDING",
                  "QUEUED",
                  "READY_FOR_DISPATCH",
                  "APPROVED",
                  "ALLOCATED",
                  "RUNNING",
                  "CANCELLING",
                ].includes(String(value.executionStatus));
              return (
                "status" in value &&
                [
                  "queued",
                  "processing",
                  "cancelling",
                  "running",
                  "ready-for-dispatch",
                  "allocated",
                ].includes(String(value.status))
              );
            };
            const anyActive = Array.isArray(data) ? data.some(active) : active(data);
            // A transient error (redeploy, 502 burst) must not freeze a live session: keep polling with backoff.
            if (query.state.error) return data !== undefined && anyActive ? 5000 : false;
            return data === undefined || anyActive ? 1500 : false;
          }
        : false,
  });
  const terminal = terminalSignature(operation, query.data);
  const terminalScope = JSON.stringify(input);
  useEffect(() => {
    if (!terminal) return;
    const scope = JSON.parse(terminalScope) as Record<string, unknown>;
    const related = operation.startsWith("runtime")
      ? ["models", "modelVersions", "model", "diagrams", "runtimeSequence", "platformSummary"]
      : [
          "models",
          "modelVersions",
          "model",
          "projects",
          "projectOverviews",
          "project",
          "platformSummary",
        ];
    void client.invalidateQueries({
      predicate: (entry) =>
        related.includes(String(entry.queryKey[1])) && queryMatchesScope(entry.queryKey, scope),
    });
  }, [terminal, terminalScope, operation, client]);
  return query;
}
export function useApiMutation<K extends Operation>(operation: K) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<Response<K>, Error, Request<K>>({
    mutationKey: ["api", operation],
    onMutate: async () => {
      if (["readNotification", "readAllNotifications"].includes(operation))
        await client.cancelQueries({ queryKey: ["api", "notifications"] });
    },
    mutationFn: (input) => api.execute(operation, input),
    onSuccess: (data, input) => {
      if (operation === "readNotification" || operation === "readAllNotifications") {
        for (const [key, cached] of client.getQueriesData<Response<"notifications">>({
          queryKey: ["api", "notifications"],
        })) {
          client.setQueryData(
            key,
            applyNotificationRead(
              cached,
              key[2] as Request<"notifications">,
              operation,
              input as Request<"readNotification" | "readAllNotifications">,
              data as Response<"readNotification" | "readAllNotifications">,
            ),
          );
        }
      }
      const related: readonly string[] = mutationInvalidations[operation] ?? [];
      const scope = mutationScope(operation, input, data);
      const upsertRow = (rows: unknown[] | undefined, next: unknown) => {
        if (!rows || !next || typeof next !== "object" || !("id" in next)) return rows;
        const exists = rows.some(
          (r) => r && typeof r === "object" && "id" in r && r.id === next.id,
        );
        return exists
          ? rows.map((r) =>
              r && typeof r === "object" && "id" in r && r.id === next.id ? next : r,
            )
          : [...rows, next];
      };
      const submissionUpdated = ["submit", "feedback", "updateFeedback", "deleteFeedback"].includes(
        operation,
      );
      if (submissionUpdated && typeof scope["submissionId"] === "string") {
        const mergeSubmission = (prev: unknown) =>
          operation !== "submit" &&
          prev &&
          typeof prev === "object" &&
          "model" in prev &&
          data &&
          typeof data === "object" &&
          "feedback" in data
            ? { ...prev, feedback: data.feedback }
            : data;
        client.setQueryData(
          ["api", "submission", { submissionId: scope["submissionId"] }],
          mergeSubmission,
        );
        // The response already contains the updated submission. Patch cached rows
        // without re-enriching the entire list after every feedback edit.
        client.setQueriesData<unknown[]>(
          {
            predicate: (q) =>
              ["submissions", "assignmentSubmissions", "workspaceSubmissions"].includes(
                String(q.queryKey[1]),
              ) && queryMatchesScope(q.queryKey, scope),
          },
          (rows) =>
            rows?.map((row) =>
              row && typeof row === "object" && "id" in row && row.id === scope["submissionId"]
                ? mergeSubmission(row)
                : row,
            ),
        );
      }
      if (operation === "submit") {
        void client.invalidateQueries({ queryKey: ["api", "workspaceSubmissions"] });
        void client.invalidateQueries({ queryKey: ["api", "course-roadmap"] });
        void client.invalidateQueries({ queryKey: ["api", "student-lab-context"] });
        void client.invalidateQueries({ queryKey: ["api", "workspace-gradebook"] });
      }
      if (operation === "gradeSubmission") {
        client.setQueryData(
          ["api", "submissionReview", { submissionId: scope["submissionId"] }],
          data,
        );
        void client.invalidateQueries({ queryKey: ["api", "workspaceSubmissions"] });
        void client.invalidateQueries({ queryKey: ["api", "assignmentSubmissions"] });
        void client.invalidateQueries({ queryKey: ["api", "submissions"] });
        void client.invalidateQueries({ queryKey: ["api", "submission"] });
        void client.invalidateQueries({ queryKey: ["api", "workspace-gradebook"] });
        void client.invalidateQueries({ queryKey: ["api", "course-roadmap"] });
        void client.invalidateQueries({ queryKey: ["api", "course-setup"] });
      }
      if (
        [
          "createWorkspace",
          "updateWorkspace",
          "archiveWorkspace",
          "addWorkspaceMember",
          "removeWorkspaceMember",
        ].includes(operation)
      ) {
        client.setQueryData<unknown[]>(["api", "workspaces", {}], (rows) => upsertRow(rows, data));
      }
      if (["createAssignment", "updateAssignment"].includes(operation) && scope["workspaceId"]) {
        client.setQueryData<unknown[]>(
          ["api", "assignments", { workspaceId: scope["workspaceId"] }],
          (rows) => upsertRow(rows, data),
        );
      }
      if (operation === "deleteAssignment" && scope["workspaceId"] && scope["assignmentId"]) {
        client.setQueryData<unknown[]>(
          ["api", "assignments", { workspaceId: scope["workspaceId"] }],
          (rows) =>
            rows?.filter(
              (r) => !(r && typeof r === "object" && "id" in r && r.id === scope["assignmentId"]),
            ),
        );
      }
      if (["createProject", "createReferenceProject"].includes(operation)) {
        client.setQueryData<unknown[]>(["api", "projects", {}], (rows) => upsertRow(rows, data));
        if (scope["workspaceId"]) {
          client.setQueryData<unknown[]>(
            ["api", "workspaceProjects", { workspaceId: scope["workspaceId"] }],
            (rows) => upsertRow(rows, data),
          );
        }
      }
      if (["createAccount", "setAccountRole", "setAccountLock"].includes(operation)) {
        client.setQueryData<unknown[]>(["api", "accounts", {}], (rows) => upsertRow(rows, data));
      }
      if (operation === "createAccount") {
        client.setQueryData<Record<string, unknown> | undefined>(
          ["api", "platformSummary", {}],
          (prev) => {
            if (!prev || typeof prev !== "object") return prev;
            const roleVal = String((input as { role?: string } | null)?.role ?? "").toLowerCase();
            return {
              ...prev,
              ...(typeof prev["users"] === "number" ? { users: prev["users"] + 1 } : {}),
              ...(roleVal === "lecturer" && typeof prev["activeLecturers"] === "number"
                ? { activeLecturers: prev["activeLecturers"] + 1 }
                : {}),
              ...(roleVal === "student" && typeof prev["activeStudents"] === "number"
                ? { activeStudents: prev["activeStudents"] + 1 }
                : {}),
            };
          },
        );
      }
      if (operation === "updateProfile") {
        client.setQueryData(["api", "session", {}], data);
      }
      if (operation === "saveRuntimeConfiguration" && scope["projectId"]) {
        client.setQueryData(
          ["api", "runtimeConfiguration", { projectId: scope["projectId"] }],
          data,
        );
      }
      if (["createScenario", "saveScenario"].includes(operation) && scope["projectId"]) {
        client.setQueryData<unknown[]>(
          ["api", "scenarios", { projectId: scope["projectId"] }],
          (rows) => upsertRow(rows, data),
        );
      }
      if (operation === "saveArchitectureDocument" && scope["modelId"] && scope["viewId"]) {
        client.setQueryData(
          ["api", "architectureDocument", { modelId: scope["modelId"], viewId: scope["viewId"] }],
          data,
        );
      }
      // Release the button after mutation success; refresh active queries in the background.
      void client.invalidateQueries({
        predicate: (q) => {
          const queryOperation = String(q.queryKey[1]);
          if (!related.includes(queryOperation) || !queryMatchesScope(q.queryKey, scope))
            return false;
          if (submissionUpdated && queryOperation === "submission") return false;
          if (
            submissionUpdated &&
            operation !== "submit" &&
            ["submissions", "assignmentSubmissions", "workspaceSubmissions"].includes(
              queryOperation,
            )
          )
            return false;
          return operation !== "gradeSubmission" || queryOperation !== "submissionReview";
        },
      });
    },
    onError: (error) => {
      toast.error(normalizeError(error).message);
    },
  });
}
export function useSession() {
  return useApiQuery("session", {}, { refreshMs: 60000 });
}
export function usePermission(permission: Permission) {
  const session = useSession();
  const api = useApi();
  return (
    hasPermission(session.data?.user?.role, permission) ||
    (api.mode === "backend" && !!session.data?.user && permission.startsWith("project:"))
  );
}
