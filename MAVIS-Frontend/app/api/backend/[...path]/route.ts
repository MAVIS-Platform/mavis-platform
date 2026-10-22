import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
const cookieName = "mavis_session";
const allowed =
  /^(auth\/login|projects(?:\/[a-f0-9-]+)?|analyzer\/(?:upload|snapshots\/[a-f0-9-]+\/analyze|jobs\/[a-f0-9-]+(?:\/cancel)?|projects\/[a-f0-9-]+\/models|models\/[a-f0-9-]+(?:\/(?:graph|impact|diagrams))?|evidences\/(?:element|relationship)\/[a-f0-9-]+|ai\/explain|diagrams\/[a-f0-9-]+\/export))$/;
async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  const jar = await cookies();
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== `${request.nextUrl.protocol}//${request.headers.get("host")}`
  )
    return NextResponse.json({ message: "Cross-origin request denied" }, { status: 403 });
  if (path === "logout" && request.method === "POST") {
    const response = NextResponse.json({ data: null });
    response.cookies.delete(cookieName);
    return response;
  }
  if (path === "session" && request.method === "GET") {
    const token = jar.get(cookieName)?.value;
    if (!token) return NextResponse.json({ data: { authenticated: false } });
    try {
      const base = process.env["MAVIS_JAVA_URL"] ?? "http://127.0.0.1:8081";
      const check = await fetch(`${base.replace(/\/$/, "")}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!check.ok && check.status !== 401 && check.status !== 403)
        return NextResponse.json({ message: "Unable to check your session" }, { status: 503 });
      const response = NextResponse.json(
        { data: { authenticated: check.ok } },
        { headers: { "Cache-Control": "no-store" } },
      );
      if (!check.ok) response.cookies.delete(cookieName);
      return response;
    } catch {
      return NextResponse.json({ message: "Java API unavailable" }, { status: 503 });
    }
  }
  if (!allowed.test(path))
    return NextResponse.json({ message: "Unsupported API path" }, { status: 404 });
  const login = path === "auth/login" && request.method === "POST";
  const token = jar.get(cookieName)?.value;
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
    const body = request.method === "GET" ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > 101 * 1024 * 1024)
      return NextResponse.json({ message: "Archive exceeds 100 MB" }, { status: 413 });
    const base = process.env["MAVIS_JAVA_URL"] ?? "http://127.0.0.1:8081";
    const upstream = await fetch(
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
    if (login && upstream.ok) {
      const result = await upstream.json();
      const { token: jwt, ...user } = result.data ?? {};
      if (!jwt) return NextResponse.json({ message: "Invalid login response" }, { status: 502 });
      const response = NextResponse.json({ ...result, data: user });
      response.cookies.set(cookieName, jwt, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 86400,
      });
      return response;
    }
    const response = new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
    if (upstream.status === 401) response.cookies.delete(cookieName);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Java API unavailable or request timed out. Retry the same analysis request." },
      { status: 502 },
    );
  }
}
export { handler as GET, handler as POST };
