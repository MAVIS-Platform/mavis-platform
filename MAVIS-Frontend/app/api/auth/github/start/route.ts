import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { safeLoginRedirect } from "@/lib/auth/safe-login-redirect";
import { githubStateCookieName, publicOrigin } from "@/lib/auth/oauth-origin";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const clientId = process.env["MAVIS_GITHUB_CLIENT_ID"]?.trim();
  if (!clientId) {
    return NextResponse.redirect(`${origin}/login?oauthError=AUTH_OAUTH_UNCONFIGURED`, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const next = safeLoginRedirect(request.nextUrl.searchParams.get("next"));
  const redirectUri = `${origin}/api/auth/github/callback`;

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl.toString(), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(githubStateCookieName, JSON.stringify({ state, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  return response;
}
