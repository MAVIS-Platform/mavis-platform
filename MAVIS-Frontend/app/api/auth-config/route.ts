import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json(
    { googleClientId: process.env["MAVIS_GOOGLE_CLIENT_ID"] ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
