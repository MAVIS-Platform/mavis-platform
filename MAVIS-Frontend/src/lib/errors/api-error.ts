export const publicErrors = {
  ACCOUNT_LOCKED: "Tài khoản của bạn đã bị khóa do vi phạm chính sách sử dụng. Vui lòng liên hệ quản trị viên để được hỗ trợ.",
  PROFILE_CURRENT_PASSWORD: "Current password is incorrect. Please try again.",
  SUBMISSION_DIAGRAM: "Save a diagram for this exact model version before submitting.",
  REFERENCE_MODEL:
    "This published snapshot has no matching model version. Ask the lecturer to finish the reference analysis.",
  GITHUB_URL: "Invalid GitHub URL. Use https://github.com/owner/repository.",
  GITHUB_REPOSITORY:
    "Public GitHub repository not found. Check the URL; private repositories require uploading a ZIP archive.",
  GITHUB_BRANCH: "The selected branch does not exist or has been deleted. Reload the branch list and select again.",
  GITHUB_LIMIT: "GitHub rate limit reached. Please try again later.",
  GITHUB_CONNECTION: "Unable to connect to GitHub or GitHub is experiencing an outage. Please try again.",
  GITHUB_EMPTY: "This repository has no branches or source files to import.",
  GITHUB_COMMIT_MISSING:
    "Commit not found in this public repository. Verify the repository URL and Commit SHA.",
  GITHUB_COMMIT: "Commit SHA must be a full 40-character hexadecimal string.",
  GITHUB_IMPORT:
    "Unable to download or process the GitHub archive. Verify the commit SHA, archive size limits, and Java/C# source files, or upload a ZIP instead.",
} as const;
export type PublicErrorCode = keyof typeof publicErrors;
export function publicErrorCode(value: unknown): PublicErrorCode | undefined {
  return typeof value === "string" && Object.hasOwn(publicErrors, value)
    ? (value as PublicErrorCode)
    : undefined;
}
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
    public readonly code?: PublicErrorCode,
  ) {
    super(code ? publicErrors[code] : messages[kind]);
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
  if (
    (error instanceof DOMException || error instanceof Error) &&
    ["AbortError", "CancelledError"].includes(error.name)
  )
    return new ApiError("cancelled");
  return new ApiError("network");
}
