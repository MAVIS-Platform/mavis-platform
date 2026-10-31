import type { QueryClient } from "@tanstack/react-query";
import type { ApiAdapter } from "@/lib/api/contracts";
import { normalizeError } from "@/lib/errors/api-error";
import { isPublicAuthOperation } from "./auth-errors";

// A resource's 401 only triggers a check of /auth/me. Public authentication
// failures and permission errors must never sign out an existing session.
export function createSessionRecovery(client: QueryClient, api: ApiAdapter) {
  let pending: Promise<void> | undefined;
  return (error: unknown, operation: unknown) => {
    if (
      normalizeError(error).kind !== "unauthorized" ||
      isPublicAuthOperation(operation) ||
      ["session", "mockLogin", "signOut"].includes(String(operation))
    )
      return;
    const previous = client.getQueryData<{ user: unknown }>(["api", "session", {}]);
    if (!previous?.user) return;
    pending ??= (async () => {
      try {
        const session = await api.execute("session", {});
        if (client.getQueryData(["api", "session", {}]) !== previous) return;
        if (!session.user) {
          await client.cancelQueries({ predicate: (q) => q.queryKey[1] !== "session" });
          client.removeQueries({ predicate: (q) => q.queryKey[1] !== "session" });
        }
        client.setQueryData(["api", "session", {}], session);
      } catch {
        // Outages and account restrictions retain their actual session error.
        void client.invalidateQueries({ queryKey: ["api", "session"] });
      }
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
