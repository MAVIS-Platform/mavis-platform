import { ApiError, publicErrorCode, type PublicErrorCode } from "@/lib/errors/api-error";

export const publicAuthOperations = [
  "signIn",
  "googleSignIn",
  "register",
  "verifyEmail",
  "resendOtp",
  "forgotPassword",
  "resetPassword",
];
export const isPublicAuthOperation = (operation: unknown) =>
  publicAuthOperations.includes(String(operation));
export const isPublicAuthPath = (path: string) =>
  /^auth\/(login|google|github|register|verify-email|resend-otp|forgot-password|reset-password)$/.test(
    path,
  );

export function authBackendCode(path: string, status: number, raw: unknown): PublicErrorCode {
  const code = publicErrorCode(
    raw && typeof raw === "object" && "errorCode" in raw ? raw.errorCode : undefined,
  );
  if (
    code &&
    (code.startsWith("AUTH_") ||
      (["auth/login", "auth/google", "auth/github"].includes(path) && code.startsWith("LOGIN_")))
  )
    return code;
  if (status === 429)
    return ["auth/resend-otp", "auth/forgot-password"].includes(path)
      ? "AUTH_RESEND_LIMIT"
      : "AUTH_RATE_LIMIT";
  // A generic 400 must never be guessed to mean an expired OTP or bad password.
  return [400, 422].includes(status) ? "AUTH_INPUT_INVALID" : "AUTH_SERVER";
}

export function authClientError(error: ApiError, operation: unknown) {
  if (!isPublicAuthOperation(operation) || error.code) return error;
  const code =
    error.kind === "network" || error.kind === "timeout"
      ? "AUTH_NETWORK"
      : error.kind === "rate-limit"
        ? ["resendOtp", "forgotPassword"].includes(String(operation))
          ? "AUTH_RESEND_LIMIT"
          : "AUTH_RATE_LIMIT"
        : ["validation", "invalid"].includes(error.kind)
          ? "AUTH_INPUT_INVALID"
          : "AUTH_SERVER";
  return new ApiError(error.kind, error.status, code, error.retryAfter);
}

export function retryAfterSeconds(value: string | null) {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
