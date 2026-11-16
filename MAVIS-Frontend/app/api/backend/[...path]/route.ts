import { javaRequest } from "@/lib/api/java-client";
import { currentSession } from "@/lib/api/java-operations";
import { NextRequest, NextResponse } from "next/server";
import { githubImportRequest } from "@/lib/mainflow-api";
import { cookies } from "next/headers";
import { allowedBackendPath } from "@/lib/api/backend-path";

export const runtime = "nodejs";
const cookieName = "mavis_session";
const refreshCookieName = "mavis_refresh";
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
      const value = await currentSession(jar.get(cookieName)?.value, request.signal);
      const response = NextResponse.json(
        { data: { authenticated: !!value.user } },
        { headers: { "Cache-Control": "no-store" } },
      );
      if (!value.user) response.cookies.delete(cookieName);
      return response;
    } catch {
      return NextResponse.json({ message: "Session service unavailable" }, { status: 503 });
    }
  }
  if (!allowedBackendPath(path))
    return NextResponse.json({ message: "Unsupported API path" }, { status: 404 });
  const login = path === "auth/login" && request.method === "POST";
  let token = jar.get(cookieName)?.value;
  if (!login && !token) return NextResponse.json({ message: "Please sign in" }, { status: 401 });
  try {
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
    let rotatedRefresh: string | undefined;
    let upstream = await fetch(
      `${base.replace(/\/$/, "")}/api/v1/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: body ?? null,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      },
    );
    if (upstream.status === 401 && !login && jar.get(refreshCookieName)?.value) {
      const refreshed = (await javaRequest("auth/refresh", undefined, {
        method: "POST",
        body: JSON.stringify({ refreshToken: jar.get(refreshCookieName)!.value }),
        signal: request.signal,
      })) as { token: string; refreshToken: string };
      token = refreshed.token;
      rotatedRefresh = refreshed.refreshToken;
      headers.set("Authorization", `Bearer ${token}`);
      upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/${path}${request.nextUrl.search}`, {
        method: request.method,
        headers,
        body: body ?? null,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      });
    }
    if (login && upstream.ok) {
      const result = await upstream.json();
      const { token: jwt, refreshToken, ...user } = result.data ?? {};
      if (!jwt) return NextResponse.json({ message: "Invalid login response" }, { status: 502 });
      const response = NextResponse.json({ ...result, data: user });
      response.cookies.set(cookieName, jwt, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 900,
      });
      if (refreshToken)
        response.cookies.set(refreshCookieName, refreshToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: request.nextUrl.protocol === "https:",
          path: "/",
          maxAge: 604800,
        });
      return response;
    }
    const response = new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        ...(upstream.headers.get("content-disposition")
          ? { "Content-Disposition": upstream.headers.get("content-disposition")! }
          : {}),
      },
    });
    if (rotatedRefresh && token) {
      response.cookies.set(cookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 900,
      });
      response.cookies.set(refreshCookieName, rotatedRefresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 604800,
      });
    }
    if (upstream.status === 401) response.cookies.delete(cookieName);
    return response;
  } catch {
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
