export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/backend/${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(response.status, body?.message ?? `Request failed (${response.status})`);
  return body?.data as T;
}
export type Project = { id: string; name: string };
export type Model = { id: string; revision: number; sourceSnapshotId?: string; status?: string };
export type Job = {
  projectId: string;
  sourceSnapshotId: string;
  jobId: string;
  status: string;
  modelVersionId?: string;
  dotnetStatus?: string;
  analysisState?: string;
  errorDiagnostics?: string;
  resultManifest?: Record<string, unknown>;
};
export type GraphNode = { id: string; name: string; type: string; sourcePath?: string };
export type GraphEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: string;
  description?: string;
};
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type Evidence = { id: string; sourceType: string; locator: string; excerpt?: string };
export type Explanation = {
  explanationText: string;
  providerMode: string;
  epistemicBadge: string;
  aiModelName: string;
  citedEvidences?: Evidence[];
};
export type Diagram = { id: string; notation: string; level: string };
export type Impact = {
  impact: {
    affectedServices: {
      serviceId: string;
      classification: string;
      distance: number;
      hops: string[];
      evidenceIds: string[];
    }[];
    truncated: boolean;
    warnings: string[];
  };
  serviceNames: Record<string, string>;
  adapterWarnings: string[];
};
export const terminalJob = (job: Job) =>
  ["COMPLETED", "SUCCEEDED", "SUCCESS", "FAILED", "CANCELLED", "TIMED_OUT", "PARTIAL"].includes(
    job.status,
  );
export const publishedModel = (job: Job): string | undefined => {
  if (!["COMPLETED", "SUCCEEDED", "SUCCESS", "PARTIAL"].includes(job.status)) return undefined;
  return (
    job.modelVersionId ||
    (typeof job.resultManifest?.["modelVersionId"] === "string"
      ? job.resultManifest["modelVersionId"]
      : undefined)
  );
};
export function contextHref(
  route: string,
  project: string,
  model = "",
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({ project, ...extra });
  if (model) params.set("model", model);
  return `${route}?${params}`;
}

export const isImpactService = (node: GraphNode): boolean => node.type === "SERVICE_CONTAINER";

export function validateJobScope(job: Job, project: string, snapshot: string): Job {
  if (job.projectId !== project || (snapshot && job.sourceSnapshotId !== snapshot))
    throw new Error("This job belongs to a different project or snapshot.");
  return job;
}
export function impactWarning(warning: string): string {
  return (
    (
      {
        ONLY_CONFIG_BOUND_OR_USER_CONFIRMED_SERVICE_HTTP_EDGES:
          "Impact includes only confirmed service HTTP dependencies.",
        UNRECONCILED_LEGACY_AND_CODE_RELATIONS_EXCLUDED:
          "Unconfirmed code and legacy relationships are excluded from this result.",
      } as Record<string, string>
    )[warning] ?? warning
  );
}
