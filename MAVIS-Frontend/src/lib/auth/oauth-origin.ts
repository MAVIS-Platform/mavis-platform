import type { NextRequest } from "next/server";

export const githubStateCookieName = "mavis_oauth_state";

export function publicOrigin(request: NextRequest) {
  const configured = process.env["MAVIS_PUBLIC_URL"]?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.replace(/:$/, "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  return `${proto}://${host}`;
}
