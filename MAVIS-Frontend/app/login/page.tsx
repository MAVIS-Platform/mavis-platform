"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/request-state";
import type { AppRole } from "@/types/domain";
export default function LoginPage() {
  const api = useApi();
  const login = useApiMutation("mockLogin");
  const real = useApiMutation("signIn");
  const client = useQueryClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const finish = async (session: { user: { role: AppRole } | null }) => {
    await client.cancelQueries();
    client.clear();
    client.setQueryData(["api", "session", {}], session);
    router.push(
      api.mode === "backend"
        ? "/"
        : session.user?.role === "admin"
          ? "/administration/users"
          : session.user?.role === "lecturer"
            ? "/workspaces"
            : "/",
    );
  };
  async function sample(role: AppRole) {
    try {
      await finish(await login.mutateAsync({ role }));
    } catch {
      /* Request error is rendered by the form. */
    }
  }
  async function signIn() {
    try {
      const session = await real.mutateAsync({ email, password });
      setPassword("");
      await finish(session);
    } catch {
      /* Request error is rendered by the form. */
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
          <div className="flex gap-3">
            {(["student", "lecturer", "admin"] as const).map((role) => (
              <Button key={role} disabled={login.isPending} onClick={() => void sample(role)}>
                {role}
              </Button>
            ))}
          </div>
          {login.isError && <ErrorState error={login.error} />}
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <p className="text-sm text-muted-foreground">Sign in with your verified MAVIS account.</p>
          <label className="block">
            Email
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            Password
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {real.isError && <ErrorState error={real.error} />}
          <Button disabled={real.isPending}>{real.isPending ? "Signing in…" : "Sign in"}</Button>
        </form>
      )}
    </main>
  );
}
