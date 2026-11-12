import { readAppConfiguration } from "@/lib/api/config";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contracts, isOperation } from "@/lib/api/contracts";
import { validateResponse } from "@/lib/api/validate-response";
import { currentSession, signIn, executeJava } from "@/lib/api/java-operations";
import { javaRequest } from "@/lib/api/java-client";
import { ApiError } from "@/lib/errors/api-error";
export const dynamic = "force-dynamic";
const cookieName = "mavis_session";
async function handle(request: NextRequest, context: { params: Promise<{ operation: string }> }) {
  const { operation } = await context.params;
  const fail = (status: number) =>
    NextResponse.json(
      { error: "Request unavailable" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (
    readAppConfiguration(process.env).mode !== "backend" ||
    !isOperation(operation) ||
    operation === "mockLogin"
  )
    return fail(501);
  const contract = contracts[operation];
  if (request.method !== (contract.mutation ? "POST" : "GET")) return fail(405);
  if (
    contract.mutation &&
    request.headers.get("origin") !== `${request.nextUrl.protocol}//${request.headers.get("host")}`
  )
    return fail(403);
  const token = request.cookies.get(cookieName)?.value;
  if (
    !token &&
    ![
      "session",
      "signIn",
      "signOut",
      "register",
      "verifyEmail",
      "resendOtp",
      "forgotPassword",
      "resetPassword",
      "googleSignIn",
    ].includes(operation)
  )
    return fail(401);
  if (Number(request.headers.get("content-length") ?? "0") > 101 * 1024 * 1024) return fail(413);
  try {
    let raw: unknown;
    if (operation === "importSource") {
      const form = await request.formData();
      const metadata: unknown = JSON.parse(String(form.get("input")));
      if (!metadata || typeof metadata !== "object") return fail(400);
      raw = { ...metadata, archive: form.get("file") };
    } else
      raw =
        operation === "signOut"
          ? {}
          : contract.mutation
            ? await request.json()
            : JSON.parse(request.nextUrl.searchParams.get("input") ?? "{}");
    const parsed = contract.input.safeParse(raw);
    if (!parsed.success) return fail(422);
    if (operation === "importSource") {
      const upload = contracts.importSource.input.parse(parsed.data);
      if (upload.archive.size !== upload.size) return fail(422);
    }
    if (operation === "session") {
      const session = await currentSession(token, request.signal);
      const response = NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
      if (!session.user) response.cookies.delete(cookieName);
      return response;
    }
    const authPaths: Record<string, string> = {
      register: "register",
      verifyEmail: "verify-email",
      resendOtp: "resend-otp",
      forgotPassword: "forgot-password",
      resetPassword: "reset-password",
    };
    const authPath = authPaths[operation];
    if (authPath) {
      const result = await javaRequest(`auth/${authPath}`, undefined, {
        method: "POST",
        body: JSON.stringify(parsed.data),
        signal: request.signal,
      });
      return NextResponse.json(
        validateResponse(operation, parsed.data, operation === "register" ? result : { ok: true }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (operation === "signIn" || operation === "googleSignIn") {
      const auth = await signIn(parsed.data, request.signal, operation === "googleSignIn");
      const response = NextResponse.json(auth.session, {
        headers: { "Cache-Control": "no-store" },
      });
      response.cookies.set(cookieName, auth.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 86400,
      });
      return response;
    }
    if (operation === "signOut") {
      if (token)
        await javaRequest("auth/logout", token, { method: "POST", signal: request.signal });
      const response = NextResponse.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store" } },
      );
      response.cookies.delete(cookieName);
      return response;
    }
    if (!token) return fail(401);
    const result = await executeJava(
      operation,
      parsed.data as Record<string, unknown>,
      token,
      request.signal,
    );
    return NextResponse.json(validateResponse(operation, parsed.data, result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return fail(502);
    if (error instanceof SyntaxError) return fail(400);
    if (error instanceof ApiError && error.code)
      return NextResponse.json(
        { error: "Request unavailable", code: error.code },
        {
          status: error.status ?? 502,
          headers: {
            "Cache-Control": "no-store",
            ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}),
          },
        },
      );
    if (error instanceof ApiError) return fail(error.status ?? 502);
    return fail(502);
  }
}
export const GET = handle;
export const POST = handle;
