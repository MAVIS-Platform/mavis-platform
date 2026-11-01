import { ApiError, fromStatus, backendErrorCode } from "@/lib/errors/api-error";
import { authBackendCode, isPublicAuthPath, retryAfterSeconds } from "@/lib/auth/auth-errors";
export async function javaRequest(
  path: string,
  token: string | undefined,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const base =
    process.env["MAVIS_JAVA_URL"] ?? process.env["MAVIS_BACKEND_URL"] ?? "http://127.0.0.1:8081";
  let response: globalThis.Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/api/v1/${path}`, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: init.signal
        ? AbortSignal.any([
            init.signal,
            AbortSignal.timeout(path.endsWith("/runtime-plan/build-images") ? 600000 : 120000),
          ])
        : AbortSignal.timeout(path.endsWith("/runtime-plan/build-images") ? 600000 : 120000),
    });
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))
      throw new ApiError("timeout", 504);
    throw new ApiError("network", 502, isPublicAuthPath(path) ? "AUTH_NETWORK" : undefined);
  }
  if (!response.ok) {
    const rawError: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    if (isPublicAuthPath(path)) {
      throw new ApiError(
        fromStatus(response.status).kind,
        response.status,
        authBackendCode(path, response.status, rawError),
        retryAfterSeconds(response.headers.get("retry-after")),
      );
    }
    const code = backendErrorCode(
      path,
      response.status,
      rawError && typeof rawError === "object" && "message" in rawError
        ? rawError.message
        : undefined,
    );
    if (code) throw new ApiError(fromStatus(response.status).kind, response.status, code);
    // Only expose this exact, known profile error; never forward arbitrary
    // upstream messages or validation bodies that could contain credentials.
    if (
      path === "auth/me" &&
      ["PATCH", "PUT"].includes(init.method ?? "") &&
      response.status === 400
    ) {
      const error: unknown = await response.json().catch(() => null);
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        error.message === "Current password is incorrect"
      )
        throw new ApiError("invalid", 400, "PROFILE_CURRENT_PASSWORD");
    }
    throw fromStatus(response.status);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ApiError("contract", 502);
  }
  if (!raw || typeof raw !== "object" || !("code" in raw)) throw new ApiError("contract", 502);
  if (typeof raw.code !== "number" || raw.code >= 400) throw new ApiError("contract", 502);
  return "data" in raw ? raw.data : undefined;
}
