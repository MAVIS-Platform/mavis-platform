"use client";

import { useState, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { BackendAdapter } from "@/lib/api/backend-adapter";
import { MockAdapter, type MockScenario } from "@/lib/api/mock-adapter";
import type { ApiAdapter } from "@/lib/api/contracts";
import { normalizeError } from "@/lib/errors/api-error";
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
  const [api] = useState<ApiAdapter>(() =>
    mode === "mock" ? new MockAdapter(mockScenario) : new BackendAdapter(),
  );
  const [client] = useState(() => {
    const report = (error: unknown) => {
      const normalized = normalizeError(error);
      if (normalized.kind === "unauthorized") {
        queryClient.setQueryData(["api", "session", {}], { user: null });
        void queryClient.cancelQueries({ predicate: (q) => q.queryKey[1] !== "session" });
        queryClient.removeQueries({ predicate: (q) => q.queryKey[1] !== "session" });
      }
    };
    const queryClient = new QueryClient({
      queryCache: new QueryCache({ onError: report }),
      mutationCache: new MutationCache({ onError: report }),
      defaultOptions: {
        queries: {
          staleTime: 30000,
          gcTime: 300000,
          retry: (count, error) =>
            count < 1 && ["network", "server"].includes(normalizeError(error).kind),
          refetchOnWindowFocus: true,
        },
        mutations: { retry: false },
      },
    });
    return queryClient;
  });
  const [projectId, setProjectId] = useState(mode === "mock" ? "sample-checkout" : "");
  const [workspaceId, setWorkspaceId] = useState(mode === "mock" ? "workspace-1" : "");
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={client}>
        <SelectionContext.Provider value={{ projectId, setProjectId, workspaceId, setWorkspaceId }}>
          {children}
          <Toaster />
        </SelectionContext.Provider>
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}
