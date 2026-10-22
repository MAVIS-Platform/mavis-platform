export type ErrorKind =
  | "invalid"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "validation"
  | "rate-limit"
  | "server"
  | "network"
  | "cancelled"
  | "timeout"
  | "contract"
  | "unconfigured";
const messages: Record<ErrorKind, string> = {
  invalid: "The request is invalid. Review your selections and try again.",
  unauthorized: "Your session has expired or sign-in is required.",
  forbidden: "You do not have permission to perform this action.",
  "not-found": "This resource is no longer available. Refresh your selection.",
  conflict: "This version has changed. Reload the latest version before saving again.",
  validation: "Some values could not be accepted. Review the form and try again.",
  "rate-limit": "Too many requests. Wait a moment before retrying.",
  server: "The service could not complete this request. Please retry.",
  network: "The service could not be reached. Check your connection and retry.",
  cancelled: "The request was cancelled. You can try again.",
  timeout: "The service took too long to respond. Please retry.",
  contract: "The service returned data this interface cannot read. Contact your administrator.",
  unconfigured:
    "This backend operation is not configured. Ask your administrator to complete API integration.",
};
export class ApiError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    public readonly status?: number,
  ) {
    super(messages[kind]);
    this.name = "ApiError";
  }
}
export function fromStatus(status: number) {
  const kinds: Record<number, ErrorKind> = {
    400: "invalid",
    401: "unauthorized",
    403: "forbidden",
    404: "not-found",
    409: "conflict",
    413: "validation",
    422: "validation",
    429: "rate-limit",
    501: "unconfigured",
    504: "timeout",
  };
  return new ApiError(kinds[status] ?? "server", status);
}
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && "status" in error && typeof error.status === "number")
    return fromStatus(error.status);
  if (error instanceof DOMException && error.name === "AbortError")
    return new ApiError("cancelled");
  return new ApiError("network");
}
