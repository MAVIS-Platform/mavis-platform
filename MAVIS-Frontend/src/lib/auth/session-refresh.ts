import type { NextResponse } from "next/server";
import { javaRequest } from "@/lib/api/java-client";

export const SESSION_COOKIE_NAME = "mavis_session";
export const REFRESH_COOKIE_NAME = "mavis_refresh";
export const SESSION_COOKIE_MAX_AGE = 3600;
export const REFRESH_COOKIE_MAX_AGE = 604800;

export interface RefreshedTokens {
  token: string;
  refreshToken: string;
}

const inflightRefreshes = new Map<string, Promise<RefreshedTokens>>();

/**
 * Deduplicates concurrent refresh calls sharing the same refresh token so
 * window-focus / multi-tab bursts do not race single-use refresh rotation into a 401 logout.
 */
export function refreshSessionToken(refreshToken: string): Promise<RefreshedTokens> {
  const existing = inflightRefreshes.get(refreshToken);
  if (existing) return existing;
  const promise = (
    javaRequest("auth/refresh", undefined, {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(15000),
    }) as Promise<RefreshedTokens>
  ).finally(() => {
    inflightRefreshes.delete(refreshToken);
  });
  inflightRefreshes.set(refreshToken, promise);
  return promise;
}

export function applySessionCookies(
  response: NextResponse,
  token: string,
  refreshToken: string | undefined,
  secure: boolean,
) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  if (refreshToken) {
    response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }
}
