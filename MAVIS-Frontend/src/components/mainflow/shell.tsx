"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, useMutation, useIsMutating } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, contextHref, type Project, type Model } from "@/lib/mainflow-api";
export const panel = "rounded-xl border border-border bg-card p-5";
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <p
      role="alert"
      className="my-3 rounded-lg border border-destructive p-3 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : "Request failed"}
    </p>
  ) : null;
}
export function FlowFrame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Authenticated title={title}>{children}</Authenticated>
    </Suspense>
  );
}
function Authenticated({ children, title }: { children: React.ReactNode; title: string }) {
  const busy = useIsMutating() > 0;
  const cache = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const project = params.get("project") ?? "";
  const model = params.get("model") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const session = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => api<{ authenticated: boolean }>("session", { signal }),
    staleTime: 0,
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: ({ signal }) => api<Project[]>("projects", { signal }),
    enabled: !!session.data?.authenticated,
  });
  const models = useQuery({
    queryKey: ["models", project],
    queryFn: ({ signal }) => api<Model[]>(`analyzer/projects/${project}/models`, { signal }),
    enabled: !!session.data?.authenticated && !!project,
  });
  const login = useMutation({
    mutationFn: () =>
      api("auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    onSuccess: async () => {
      setPassword("");
      cache.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      cache.setQueryData(["session"], { authenticated: true });
      router.refresh();
    },
  });
  async function logout() {
    await api("logout", { method: "POST" });
    cache.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    cache.setQueryData(["session"], { authenticated: false });
    router.replace("/import");
    router.refresh();
  }
  return (
    <AppShell
      live
      contextName={projects.data?.find((p) => p.id === project)?.name ?? "Choose a project"}
      navigationQuery={`?${new URLSearchParams({ project, model })}`}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {session.data?.authenticated && (
          <Button variant="outline" onClick={logout}>
            Sign out
          </Button>
        )}
      </div>
      {session.isPending ? (
        <p>Checking session…</p>
      ) : !session.data?.authenticated ? (
        <form
          className={`${panel} mx-auto max-w-md space-y-4`}
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <h2 className="text-lg font-medium">Sign in to MAVIS</h2>
          <label className="block">
            Email
            <Input
              autoComplete="username"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            Password
            <Input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorNotice error={login.error || session.error} />
          <Button disabled={login.isPending}>{login.isPending ? "Signing in…" : "Sign in"}</Button>
        </form>
      ) : (
        <>
          <div className={`${panel} mb-5 flex flex-wrap items-center gap-4`}>
            <label>
              Project{" "}
              <select
                aria-label="Project"
                disabled={busy}
                className="ml-2 max-w-64 rounded border bg-background p-2"
                value={project}
                onChange={(e) => router.push(contextHref("/import", e.target.value))}
              >
                <option value="">Choose a project</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {project && (
              <label>
                Model{" "}
                <select
                  aria-label="Model"
                  disabled={busy}
                  className="ml-2 max-w-72 rounded border bg-background p-2"
                  value={model}
                  onChange={(e) =>
                    router.push(contextHref("/architecture", project, e.target.value))
                  }
                >
                  <option value="">Choose a model</option>
                  {models.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      Revision {m.revision} · {m.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <nav className="flex flex-wrap gap-4">
              {(
                [
                  ["Import", "/import"],
                  ["Architecture", "/architecture"],
                  ["Impact", "/impact"],
                  ["Explain", "/explain"],
                ] as const
              ).map(([name, path]) => (
                <Link
                  className="text-primary underline"
                  key={path}
                  href={contextHref(path, project, model)}
                >
                  {name}
                </Link>
              ))}
            </nav>
          </div>
          <ErrorNotice error={projects.error || models.error} />
          {children}
        </>
      )}
    </AppShell>
  );
}
