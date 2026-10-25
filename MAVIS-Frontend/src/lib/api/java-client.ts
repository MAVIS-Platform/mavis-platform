import { ApiError, fromStatus } from "@/lib/errors/api-error";
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
        ? AbortSignal.any([init.signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000),
    });
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))
      throw new ApiError("timeout", 504);
    throw new ApiError("network", 502);
  }
  if (!response.ok) throw fromStatus(response.status);
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
