"use client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import type { AppRole } from "@/types/domain";
export default function LoginPage() {
  const api = useApi();
  const login = useApiMutation("mockLogin");
  const client = useQueryClient();
  const router = useRouter();
  async function signIn(role: AppRole) {
    try {
      const session = await login.mutateAsync({ role });
      await client.cancelQueries();
      client.clear();
      client.setQueryData(["api", "session", {}], session);
      router.push(
        role === "admin" ? "/administration/users" : role === "lecturer" ? "/workspaces" : "/",
      );
    } catch {
      /* Error is rendered below. */
    }
  }
  return (
    <main className="mx-auto max-w-lg space-y-6 p-8">
      <h1 className="text-xl font-semibold">MAVIS · Sign in</h1>
      {api.mode === "mock" ? (
        <>
          <p className="text-sm text-muted-foreground">
            Mock mode. Choose a sample account to explore role permissions. Changes reset on reload.
          </p>
          <div className="flex flex-wrap gap-3">
            {(["student", "lecturer", "admin"] as const).map((role) => (
              <Button
                key={role}
                disabled={login.isPending}
                onClick={() => {
                  void signIn(role);
                }}
              >
                {role}
              </Button>
            ))}
          </div>
          {login.isError && <ErrorState error={login.error} />}
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Backend mode requires a server-managed session. The sign-in / identity-provider contract
          has not been supplied. Configure authentication with the backend team, then reload the
          protected page. No demo account is available in backend mode.
        </p>
      )}
    </main>
  );
}
