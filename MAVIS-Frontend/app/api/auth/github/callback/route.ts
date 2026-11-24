import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readAppConfiguration } from "@/lib/api/config";
import { signIn } from "@/lib/api/java-operations";
import { defaultLoginDestination } from "@/lib/auth/login-destination";
import { safeLoginRedirect } from "@/lib/auth/safe-login-redirect";
import { ApiError } from "@/lib/errors/api-error";
import { githubStateCookieName, publicOrigin } from "@/lib/auth/oauth-origin";
import { applySessionCookies } from "@/lib/auth/session-refresh";

export const dynamic = "force-dynamic";

function statesMatch(expected: string, actual: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function redirectToLoginError(origin: string, code: string) {
  const response = NextResponse.redirect(`${origin}/login?oauthError=${encodeURIComponent(code)}`, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.delete(githubStateCookieName);
  return response;
}

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  if (readAppConfiguration(process.env).mode !== "backend") {
    return redirectToLoginError(origin, "AUTH_OAUTH_UNCONFIGURED");
  }

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    return redirectToLoginError(
      origin,
      providerError === "access_denied" ? "AUTH_OAUTH_CANCELLED" : "AUTH_OAUTH_FAILED",
    );
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const state = request.nextUrl.searchParams.get("state")?.trim() ?? "";
  const rawStateCookie = request.cookies.get(githubStateCookieName)?.value;

  if (!code || !state || !rawStateCookie) {
    return redirectToLoginError(origin, "AUTH_OAUTH_FAILED");
  }

  let stored: { state?: unknown; next?: unknown };
  try {
    stored = JSON.parse(rawStateCookie) as { state?: unknown; next?: unknown };
  } catch {
    return redirectToLoginError(origin, "AUTH_OAUTH_FAILED");
  }

  if (typeof stored.state !== "string" || !statesMatch(stored.state, state)) {
    return redirectToLoginError(origin, "AUTH_OAUTH_FAILED");
  }

  try {
    const redirectUri = `${origin}/api/auth/github/callback`;
    const auth = await signIn({ code, redirectUri }, request.signal, "github");
    const safeNext = typeof stored.next === "string" ? safeLoginRedirect(stored.next) : null;
    const destination = safeNext ?? defaultLoginDestination(auth.session.user.role);

    const response = NextResponse.redirect(`${origin}${destination}`, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
    const secure = origin.startsWith("https://");
    response.cookies.delete(githubStateCookieName);
    applySessionCookies(response, auth.token, auth.refreshToken, secure);
    return response;
  } catch (error) {
    const code = error instanceof ApiError && error.code ? error.code : "AUTH_OAUTH_FAILED";
    return redirectToLoginError(origin, code);
  }
}
