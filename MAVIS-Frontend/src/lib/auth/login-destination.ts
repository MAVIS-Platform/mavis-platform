import type { ApiAdapter } from "@/lib/api/contracts";
import type { AppRole } from "@/types/domain";
import { globalNavigation, projectNavigation, lecturerWorkspaceNavigation } from "@/lib/navigation";
import { safeLoginRedirect } from "./safe-login-redirect";

export function defaultLoginDestination(role: AppRole) {
  return role === "admin" ? "/administration/health" : role === "lecturer" ? "/workspaces" : "/";
}

export async function loginDestination(next: string | null, role: AppRole, api: ApiAdapter) {
  const fallback = defaultLoginDestination(role);
  const safe = safeLoginRedirect(next);
  if (!safe) return fallback;
  const url = new URL(safe, "https://mavis.invalid");
  const path = url.pathname.replace(/\/$/, "");
  const known =
    [...globalNavigation[role], ...projectNavigation, ...lecturerWorkspaceNavigation].some(
      (group) => group.items.some((item) => item.href === path),
    ) ||
    ["/profile", "/notifications", "/references", "/import"].includes(path) ||
    /^\/submissions\/[^/]+$/.test(path);
  if (!known || (path.startsWith("/administration/") && role !== "admin")) return fallback;
  try {
    const projectId = url.searchParams.get("project");
    const workspaceId = url.searchParams.get("workspace");
    if (projectId) await api.execute("project", { projectId });
    if (workspaceId) {
      const workspaces = await api.execute("workspaces", {});
      if (!workspaces.some((workspace) => workspace.id === workspaceId)) return fallback;
    }
    if (path.startsWith("/submissions/")) {
      await api.execute("submission", { submissionId: decodeURIComponent(path.slice(13)) });
    }
    return safe;
  } catch {
    // The backend remains authoritative for current resource access.
    return fallback;
  }
}
