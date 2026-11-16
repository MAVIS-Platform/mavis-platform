"use client";

import { Suspense, useState, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { BackendAdapter } from "@/lib/api/backend-adapter";
import { MockAdapter, type MockScenario } from "@/lib/api/mock-adapter";
import type { ApiAdapter } from "@/lib/api/contracts";
import { normalizeError } from "@/lib/errors/api-error";
import { createSessionRecovery } from "@/lib/auth/session-recovery";
import { ApiContext, SelectionContext } from "./app-context";
export function AppProvider({
  children,
  mode,
  mockScenario = "normal",
}: {
  children: ReactNode;
  mode: "mock" | "backend";
  mockScenario?: MockScenario;
}) {
  const pathname = usePathname();
  const [api] = useState<ApiAdapter>(() =>
    mode === "mock" ? new MockAdapter(mockScenario) : new BackendAdapter(),
  );
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          void recover(error, query.queryKey[1]);
        },
      }),
      mutationCache: new MutationCache({
        onError: (error, _variables, _context, mutation) => {
          void recover(error, mutation.options.mutationKey?.[1]);
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30000,
          gcTime: 300000,
          retry: (count, error) =>
            count < 2 && ["network", "server", "timeout"].includes(normalizeError(error).kind),
          refetchOnWindowFocus: false,
        },
        mutations: { retry: false },
      },
    });
    const recover = createSessionRecovery(queryClient, api);
    return queryClient;
  });

  // The public homepage must render before workspace selection hydrates.
  if (pathname === "/") return children;

  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={client}>
        <Suspense fallback={<p className="p-8">Loading workspace…</p>}>
          <UrlSelection mode={mode}>{children}</UrlSelection>
        </Suspense>
        <Toaster />
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}

function UrlSelection({ mode, children }: { mode: "mock" | "backend"; children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = params.get("project") ?? (mode === "mock" ? "sample-checkout" : "");
  const workspaceId =
    params.get("workspace") ?? (mode === "mock" && pathname !== "/workspaces" ? "workspace-1" : "");
  function select(kind: "project" | "workspace", value: string) {
    const next = new URLSearchParams(params.toString());
    for (const key of ["model", "snapshot", "job", "target", "kind"]) next.delete(key);
    if (kind === "workspace") next.delete("project");
    if (value) next.set(kind, value);
    else next.delete(kind);
    router.replace(`${pathname}?${next}`);
  }
  return (
    <SelectionContext.Provider
      value={{
        projectId,
        workspaceId,
        setProjectId: (value) => select("project", value),
        setWorkspaceId: (value) => select("workspace", value),
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}
