"use client";
import { useContext, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiContext, SelectionContext } from "@/providers/app-context";
import type { Operation, Request, Response } from "@/lib/api/contracts";
import { normalizeError } from "@/lib/errors/api-error";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { mutationInvalidations, terminalSignature } from "@/lib/api/cache-policy";
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
  options: { enabled?: boolean; poll?: boolean } = {},
) {
  const api = useApi();
  const client = useQueryClient();
  const query = useQuery<Response<K>, Error>({
    queryKey: ["api", operation, input],
    queryFn: ({ signal }) => api.execute(operation, input, signal),
    enabled: options.enabled ?? true,
    refetchInterval: options.poll
      ? (query) => {
          const data: unknown = query.state.data;
          const active = (value: unknown) => {
            if (!value || typeof value !== "object") return false;
            if ("executionStatus" in value)
              return [
                "NOT_STARTED",
                "PENDING",
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
          if (query.state.error) return false;
          if (Array.isArray(data)) return data.some(active) ? 1500 : false;
          return data === undefined || active(data) ? 1500 : false;
        }
      : false,
  });
  const terminal = terminalSignature(operation, query.data);
  useEffect(() => {
    if (!terminal) return;
    const related = operation.startsWith("runtime")
      ? ["platformSummary"]
      : ["models", "modelVersions", "model", "projects", "project", "platformSummary"];
    void client.invalidateQueries({
      predicate: (entry) => related.includes(String(entry.queryKey[1])),
    });
  }, [terminal, operation, client]);
  return query;
}
export function useApiMutation<K extends Operation>(operation: K) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<Response<K>, Error, Request<K>>({
    mutationFn: (input) => api.execute(operation, input),
    onSuccess: async () => {
      const related: readonly string[] = mutationInvalidations[operation] ?? [];
      await client.invalidateQueries({ predicate: (q) => related.includes(String(q.queryKey[1])) });
      toast.success(
        operation === "signOut"
          ? "Signed out"
          : ["mockLogin", "signIn"].includes(operation)
            ? api.mode === "mock"
              ? "Sample account selected"
              : "Signed in"
            : api.mode === "mock"
              ? "Sample change saved for this browser session"
              : "Change saved",
      );
    },
    onError: (error) => {
      toast.error(normalizeError(error).message);
    },
  });
}
export function useSession() {
  return useApiQuery("session", {});
}
export function usePermission(permission: Permission) {
  const session = useSession();
  const api = useApi();
  return (
    hasPermission(session.data?.user?.role, permission) ||
    (api.mode === "backend" && !!session.data?.user && permission.startsWith("project:"))
  );
}
