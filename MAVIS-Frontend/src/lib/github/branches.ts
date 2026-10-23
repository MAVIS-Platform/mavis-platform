import { ApiError } from "../errors/api-error";
import { githubImportRequest } from "../mainflow-api";
import { z } from "zod";
export async function githubBranches(repositoryUrl: string, signal?: AbortSignal) {
  let normalized: string;
  try {
    normalized = githubImportRequest("", repositoryUrl, "main", "").repositoryUrl;
  } catch {
    throw new ApiError("validation", 422, "GITHUB_URL");
  }
  const repo = new URL(normalized).pathname;
  async function get(path: string) {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos${repo}${path}`, {
        headers: { Accept: "application/vnd.github+json" },
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch {
      throw new ApiError("network", 502, "GITHUB_CONNECTION");
    }
    if (response.status === 404) throw new ApiError("not-found", 404, "GITHUB_REPOSITORY");
    if (response.status === 403 || response.status === 429)
      throw new ApiError("rate-limit", 429, "GITHUB_LIMIT");
    if (!response.ok) throw new ApiError("server", 502, "GITHUB_CONNECTION");
    return await response.json();
  }
  const metadata = z.object({ default_branch: z.string() }).parse(await get(""));
  const branches: string[] = [];
  let truncated = false;
  for (let page = 1; page <= 10; page++) {
    const batch = z
      .array(z.object({ name: z.string() }))
      .parse(await get(`/branches?per_page=100&page=${page}`));
    branches.push(...batch.map((row) => row.name));
    if (batch.length < 100) break;
    if (page === 10) truncated = true;
  }
  if (!branches.length) throw new ApiError("invalid", 400, "GITHUB_EMPTY");
  if (!branches.includes(metadata.default_branch)) branches.unshift(metadata.default_branch);
  return { defaultBranch: metadata.default_branch, branches: [...new Set(branches)], truncated };
}

// Resolve the selected ref once so archive ingestion and later analysis use immutable source.
export async function githubRevision(repositoryUrl: string, ref: string, signal?: AbortSignal) {
  let repository: string;
  try {
    repository = githubImportRequest("", repositoryUrl, "main", "").repositoryUrl;
  } catch {
    throw new ApiError("validation", 422, "GITHUB_URL");
  }
  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos${new URL(repository).pathname}/commits/${encodeURIComponent(ref)}`,
      {
        headers: { Accept: "application/vnd.github+json" },
        redirect: "error",
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new ApiError("network", 502, "GITHUB_CONNECTION");
  }
  if (response.status === 404 || response.status === 422)
    throw new ApiError(
      "not-found",
      404,
      /^[a-fA-F0-9]{40}$/.test(ref) ? "GITHUB_COMMIT_MISSING" : "GITHUB_BRANCH",
    );
  if (response.status === 403 || response.status === 429)
    throw new ApiError("rate-limit", 429, "GITHUB_LIMIT");
  if (!response.ok) throw new ApiError("server", 502, "GITHUB_CONNECTION");
  return z.object({ sha: z.string().regex(/^[a-fA-F0-9]{40}$/) }).parse(await response.json()).sha;
}
