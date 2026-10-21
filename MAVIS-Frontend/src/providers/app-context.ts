"use client";
import { createContext } from "react";
import type { ApiAdapter } from "@/lib/api/contracts";
export const ApiContext = createContext<ApiAdapter | null>(null);
export const SelectionContext = createContext<{
  projectId: string;
  setProjectId: (id: string) => void;
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
} | null>(null);
