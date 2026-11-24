import { javaRequest } from "@/lib/api/java-client";
import { currentSession } from "@/lib/api/java-operations";
import { NextRequest, NextResponse } from "next/server";
import { githubImportRequest } from "@/lib/mainflow-api";
import { cookies } from "next/headers";
import { allowedBackendPath } from "@/lib/api/backend-path";
import { ApiError } from "@/lib/errors/api-error";
import {
  applySessionCookies,
  REFRESH_COOKIE_NAME,
  refreshSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session-refresh";

export const runtime = "nodejs";
const cookieName = SESSION_COOKIE_NAME;
const refreshCookieName = REFRESH_COOKIE_NAME;
async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  const jar = await cookies();
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== `${request.nextUrl.protocol}//${request.headers.get("host")}`
  )
    return NextResponse.json({ message: "Cross-origin request denied" }, { status: 403 });
  if (path === "logout" && request.method === "POST") {
    try {
      const token = jar.get(cookieName)?.value;
      if (token)
        await javaRequest("auth/logout", token, {
          method: "POST",
          headers: { "X-Refresh-Token": jar.get(refreshCookieName)?.value ?? "" },
          signal: request.signal,
        });
      const response = NextResponse.json(
        { data: null },
        { headers: { "Cache-Control": "no-store" } },
      );
      response.cookies.delete(cookieName);
      response.cookies.delete(refreshCookieName);
      return response;
    } catch {
      return NextResponse.json({ message: "Sign out unavailable. Please retry." }, { status: 503 });
    }
  }
  if (path === "session" && request.method === "GET") {
    try {
      const secure = request.nextUrl.protocol === "https:";
      let activeToken = jar.get(cookieName)?.value;
      const refreshToken = jar.get(refreshCookieName)?.value;
      let rotatedRefresh: string | undefined;
      let refreshRevoked = false;
      if (!activeToken && refreshToken) {
        try {
          const refreshed = await refreshSessionToken(refreshToken);
          activeToken = refreshed.token;
          rotatedRefresh = refreshed.refreshToken;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) refreshRevoked = true;
          else throw err;
        }
      }
      let value = activeToken ? await currentSession(activeToken, request.signal) : { user: null };
      if (!value.user && refreshToken && !rotatedRefresh && !refreshRevoked) {
        try {
          const refreshed = await refreshSessionToken(refreshToken);
          activeToken = refreshed.token;
          rotatedRefresh = refreshed.refreshToken;
          value = await currentSession(activeToken, request.signal);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) refreshRevoked = true;
          else throw err;
        }
      }
      const response = NextResponse.json(
        { data: { authenticated: !!value.user } },
        { headers: { "Cache-Control": "no-store" } },
      );
      if (!value.user) {
        response.cookies.delete(cookieName);
        if (refreshRevoked) response.cookies.delete(refreshCookieName);
      } else if (rotatedRefresh && activeToken) {
        applySessionCookies(response, activeToken, rotatedRefresh, secure);
      }
      return response;
    } catch {
      return NextResponse.json({ message: "Session service unavailable" }, { status: 503 });
    }
  }
  if (!allowedBackendPath(path))
    return NextResponse.json({ message: "Unsupported API path" }, { status: 404 });
  const login = path === "auth/login" && request.method === "POST";
  const secure = request.nextUrl.protocol === "https:";
  let token = jar.get(cookieName)?.value;
  const refreshToken = jar.get(refreshCookieName)?.value;
  if (!login && !token && !refreshToken)
    return NextResponse.json({ message: "Please sign in" }, { status: 401 });
  try {
    let rotatedRefresh: string | undefined;
    if (!login && !token && refreshToken) {
      const refreshed = await refreshSessionToken(refreshToken);
      token = refreshed.token;
      rotatedRefresh = refreshed.refreshToken;
    }
    const headers = new Headers();
    for (const key of ["content-type", "idempotency-key"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    if (!login && token) headers.set("Authorization", `Bearer ${token}`);
    if (Number(request.headers.get("content-length") ?? "0") > 101 * 1024 * 1024)
      return NextResponse.json({ message: "Archive exceeds 100 MB" }, { status: 413 });
    let body = request.method === "GET" ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > 101 * 1024 * 1024)
      return NextResponse.json({ message: "Archive exceeds 100 MB" }, { status: 413 });
    if (path === "analyzer/import/github" && request.method === "POST") {
      try {
        const input = JSON.parse(new TextDecoder().decode(body ?? new ArrayBuffer(0)));
        if (
          typeof input.projectId !== "string" ||
          typeof input.repositoryUrl !== "string" ||
          (input.branchName != null && typeof input.branchName !== "string") ||
          (input.commitSha != null && typeof input.commitSha !== "string")
        )
          throw new Error("Invalid GitHub import request");
        body = new TextEncoder().encode(
          JSON.stringify(
            githubImportRequest(
              input.projectId,
              input.repositoryUrl,
              input.branchName ?? "main",
              input.commitSha ?? "",
            ),
          ),
        ).buffer as ArrayBuffer;
        headers.set("Content-Type", "application/json");
      } catch (error) {
        return NextResponse.json(
          { message: error instanceof Error ? error.message : "Invalid GitHub import request" },
          { status: 400 },
        );
      }
    }
    const base = process.env["MAVIS_JAVA_URL"] ?? "http://127.0.0.1:8081";
    const isSseStream = request.method === "GET" && path.endsWith("/studio/stream");
    if (isSseStream) headers.set("Accept", "text/event-stream");
    let upstream = await fetch(
      `${base.replace(/\/$/, "")}/api/v1/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: body ?? null,
        cache: "no-store",
        redirect: "error",
        signal: isSseStream ? request.signal : AbortSignal.timeout(120000),
      },
    );
    if (upstream.status === 401 && !login && refreshToken && !rotatedRefresh) {
      const refreshed = await refreshSessionToken(refreshToken);
      token = refreshed.token;
      rotatedRefresh = refreshed.refreshToken;
      headers.set("Authorization", `Bearer ${token}`);
      upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/${path}${request.nextUrl.search}`, {
        method: request.method,
        headers,
        body: body ?? null,
        cache: "no-store",
        redirect: "error",
        signal: isSseStream ? request.signal : AbortSignal.timeout(120000),
      });
    }
    if (isSseStream && upstream.ok && upstream.body) {
      const streamResponse = new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
      if (rotatedRefresh && token) {
        applySessionCookies(streamResponse, token, rotatedRefresh, secure);
      }
      return streamResponse;
    }
    if (login && upstream.ok) {
      const result = await upstream.json();
      const { token: jwt, refreshToken: issuedRefresh, ...user } = result.data ?? {};
      if (!jwt) return NextResponse.json({ message: "Invalid login response" }, { status: 502 });
      const response = NextResponse.json({ ...result, data: user });
      applySessionCookies(response, jwt, issuedRefresh, secure);
      return response;
    }
    const isAvatarAsset = request.method === "GET" && path.startsWith("auth/avatars/");
    const response = new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": isAvatarAsset && upstream.ok ? "private, max-age=86400" : "no-store",
        ...(isAvatarAsset ? { "X-Content-Type-Options": "nosniff" } : {}),
        ...(upstream.headers.get("content-disposition")
          ? { "Content-Disposition": upstream.headers.get("content-disposition")! }
          : {}),
      },
    });
    if (rotatedRefresh && token && upstream.status !== 401) {
      applySessionCookies(response, token, rotatedRefresh, secure);
    }
    if (upstream.status === 401) {
      response.cookies.delete(cookieName);
      response.cookies.delete(refreshCookieName);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const response = NextResponse.json(
        { message: "Please sign in" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      response.cookies.delete(cookieName);
      response.cookies.delete(refreshCookieName);
      return response;
    }
    return NextResponse.json(
      { message: "Java API unavailable or request timed out. Retry the same analysis request." },
      { status: 502 },
    );
  }
}
export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
