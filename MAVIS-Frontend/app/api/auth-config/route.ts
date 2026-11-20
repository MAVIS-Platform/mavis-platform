import { NextResponse } from "next/server";

export function GET() {
  const googleClientId = process.env["MAVIS_GOOGLE_CLIENT_ID"]?.trim() || null;
  const githubClientId = process.env["MAVIS_GITHUB_CLIENT_ID"]?.trim() || null;
  return NextResponse.json(
    { googleClientId, githubClientId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
