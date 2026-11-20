export const publicErrors = {
  PREFLIGHT_FAILED: "The Lab source failed Runner validation. Ask your lecturer to check the Studio configuration.",
  INCOMPLETE_SCENARIO: "Complete a verified Start, Stop, or Scale action before finishing the Studio session.",
  DELETE_BUSY: "Stop active analysis/runtime work and resolve cleanup before deleting this item.",
  DELETE_PROTECTED:
    "Published reference data, submitted coursework and runtime-linked snapshots must be retained and cannot be deleted here.",
  DELETE_REFERENCED:
    "This snapshot has dependent revisions or protected records. Delete the dependent data only through its own supported workflow, or retain this snapshot.",
  LOGIN_CREDENTIALS: "Email or password is incorrect.",
  LOGIN_VERIFICATION: "Please verify your email before signing in.",
  LOGIN_LOCKED: "Your account is locked. Please contact the administrator for assistance.",
  AUTH_CODE_INVALID: "The verification code is incorrect. Please try again.",
  AUTH_CODE_EXPIRED: "The verification code has expired. Please request a new code.",
  AUTH_CODE_USED: "This verification code has already been used. Please request a new code.",
  AUTH_RESET_INVALID: "The password reset code is invalid. Please check it and try again.",
  AUTH_RESET_EXPIRED: "The password reset code has expired. Please request a new code.",
  AUTH_RESET_USED: "This password reset code has already been used. Please request a new code.",
  AUTH_PASSWORD_POLICY:
    "Your password does not meet the requirements. Please review the password rules and try again.",
  AUTH_INPUT_INVALID: "Please check the information entered and try again.",
  AUTH_VERIFICATION_UNAVAILABLE:
    "Email verification could not be completed. Please check your code or sign in if already verified.",
  AUTH_EMAIL_DELIVERY: "We couldn't send the email right now. Please try again later.",
  AUTH_OAUTH_UNCONFIGURED: "Third-party sign-in is not configured for this workspace.",
  AUTH_OAUTH_FAILED: "Third-party sign-in failed. Please try again.",
  AUTH_OAUTH_EMAIL_UNVERIFIED:
    "Your third-party account must have a verified email address to sign in.",
  AUTH_OAUTH_CANCELLED: "Third-party sign-in was cancelled.",
  AUTH_NETWORK: "Unable to connect. Please check your internet connection and try again.",
  AUTH_SERVER: "Something went wrong. Please try again later.",
  AUTH_RATE_LIMIT: "Too many requests. Please wait a moment before trying again.",
  AUTH_RESEND_LIMIT: "Too many requests. Please wait before requesting another code.",
  SUBMISSION_DEADLINE: "The assignment deadline has passed. Ask your lecturer to extend it.",
  SUBMISSION_SCOPE: "Use a project created for this assignment's workspace.",
  SUBMISSION_OWNER: "Only the project owner can submit this work.",
  SUBMISSION_PARTIAL: "Complete or confirm this partial analysis before submitting.",
  SUBMISSION_MODEL_MISMATCH: "The selected model version does not belong to this project.",
  SUBMISSION_SNAPSHOT_MISSING:
    "The selected model version is missing an immutable source snapshot.",
  SUBMISSION_DIAGRAM_MISMATCH: "The selected diagram bundle does not belong to this model version.",
  SUBMISSION_REQUIRED_DIAGRAM:
    "One or more required diagram types are missing from your selection. Save or select the required diagrams first.",
  SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED: "Add an explanation for each required Snapshot (up to 5,000 characters each).",
  SUBMISSION_SNAPSHOT_IDS_INVALID: "The Snapshot selection has changed. Reload the Lab and review its required evidence.",
  SUBMISSION_STUDIO_RECEIPT_REQUIRED: "Select a verified Studio receipt for the selected model version.",
  SUBMISSION_QUIZ_REQUIRED: "Pass the current Lab Quiz before submitting.",
  SUBMISSION_LAB_PASSED: "This Lab is already complete. View your passing submission in My Submissions.",
  REVIEW_SNAPSHOT_GRADES_INCOMPLETE: "Enter a grade for every frozen Snapshot before publishing.",
  REVIEW_SNAPSHOT_GRADES_INVALID: "The Snapshot grades do not match this submission. Refresh the review.",
  REVIEW_FROZEN_SNAPSHOTS_REQUIRED: "Return this submission with instructions to resubmit the required Snapshots.",
  REVIEW_PASSED_FINAL: "This Lab result is finalized. Refresh the review to see the published grade.",
  SUBMISSION_EVALUATION_MISMATCH:
    "The selected evaluation run does not belong to this model version.",
  SUBMISSION_RUNTIME_MISMATCH:
    "The selected runtime session does not match this project and source snapshot.",
  SUBMISSION_RUNTIME_REQUIRED:
    "This assignment requires a completed (PASSED) Runtime Trace session on the same source snapshot.",
  PROFILE_CURRENT_PASSWORD: "Current password is incorrect. Please try again.",
  SUBMISSION_DIAGRAM: "Save a diagram for this exact model version before submitting.",
  REFERENCE_MODEL:
    "This published snapshot has no matching model version. Ask the lecturer to finish the reference analysis.",
  GITHUB_URL: "Invalid GitHub URL. Use https://github.com/owner/repository.",
  GITHUB_REPOSITORY:
    "Public GitHub repository not found. Check the URL; private repositories require uploading a ZIP archive.",
  GITHUB_BRANCH:
    "The selected branch does not exist or has been deleted. Reload the branch list and select again.",
  GITHUB_LIMIT: "GitHub rate limit reached. Please try again later.",
  GITHUB_CONNECTION:
    "Unable to connect to GitHub or GitHub is experiencing an outage. Please try again.",
  GITHUB_EMPTY: "This repository has no branches or source files to import.",
  GITHUB_COMMIT_MISSING:
    "Commit not found in this public repository. Verify the repository URL and Commit SHA.",
  GITHUB_COMMIT: "Commit SHA must be a full 40-character hexadecimal string.",
  GITHUB_IMPORT:
    "Unable to download or process the GitHub archive. Verify the commit SHA, archive size limits, and Java/C# source files, or upload a ZIP instead.",
  STUDIO_VALIDATION_REQUIRED:
    "Run a verified Studio Playtest session (with at least one Stop/Start/Scale action) before freezing this Lab's topology.",
  STUDIO_PUBLISH_FIRST: "Publish the Lab to the class before freezing its Studio topology.",
  STUDIO_EVIDENCE_MISSING:
    "Complete a verified Stop, Start, or Scale action in Studio Playtest before freezing.",
  STUDIO_TOPOLOGY_MISSING:
    "Run Auto-Configure Studio first so this Lab has a prepared Studio topology.",
  STUDIO_TOPOLOGY_INVALID:
    "Only application services configured in the Docker runtime profile can be added as Studio blocks.",
  RUNTIME_PROFILE_INVALID:
    "Runtime profile is invalid or exceeds limits. Re-sync Docker configuration and try again.",
  LAB_PUBLISH_CONTENT_REQUIRED:
    "Add a Lab description, attach a Theory lesson, or pin a Reference Source before adding to class.",
  WORKSPACE_CODE_EXISTS:
    "A class with this code already exists. Choose a different class code.",
  WORKSPACE_MEMBER_EXISTS: "This user is already a member of this class.",
  WORKSPACE_CREATOR_PROTECTED: "The class creator cannot be removed from the class.",
  WORKSPACE_ARCHIVED: "This class is archived and cannot be modified.",
  PASSKEY_ALREADY_EXISTS: "This passkey already exists. Choose a different passkey.",
  INVALID_PASSKEY_FORMAT: "Passkey format is invalid. Use letters, numbers, or hyphens.",
  INVALID_OR_EXPIRED_PASSKEY:
    "Invalid or expired passkey. Check with your lecturer and try again.",
  COURSE_CAPACITY_REACHED: "This class has reached its maximum student capacity.",
  ALREADY_ENROLLED: "You are already enrolled in this class.",
  ASSIGNMENT_HAS_SUBMISSIONS: "Cannot delete a Lab that already has student submissions.",
  ASSIGNMENT_PUBLISHED_PROTECTED:
    "Published Labs are part of the course roadmap and cannot be deleted.",
  ASSIGNMENT_PINNED_SOURCE: "A published Lab keeps its pinned reference source.",
  ACCOUNT_EMAIL_EXISTS: "An account with this email already exists.",
} as const;
export type PublicErrorCode = keyof typeof publicErrors;
// Match only reviewed business messages. Arbitrary upstream text can contain secrets.
export function backendErrorCode(
  path: string,
  status: number,
  message: unknown,
): PublicErrorCode | undefined {
  if (typeof message !== "string") return undefined;
  if (path.startsWith("projects/") && status === 409) {
    if (
      message ===
      "Deletion is blocked while analysis or runtime work is active or cleanup is unresolved."
    )
      return "DELETE_BUSY";
    if (
      [
        "Deletion is blocked for published reference data or submitted coursework.",
        "Deletion is blocked for published, submitted or runtime-linked snapshots.",
      ].includes(message)
    )
      return "DELETE_PROTECTED";
    if (message === "This snapshot has dependent revisions or protected records.")
      return "DELETE_REFERENCED";
  }
  if (/^submissions\/[^/]+\/review$/.test(path)) {
    if (status === 409 && message === "PASSED_LAB_REVIEW_FINAL") return "REVIEW_PASSED_FINAL";
    if (status === 400 && message === "SNAPSHOT_GRADES_INCOMPLETE") return "REVIEW_SNAPSHOT_GRADES_INCOMPLETE";
    if (status === 400 && message === "INVALID_SNAPSHOT_GRADE_IDS") return "REVIEW_SNAPSHOT_GRADES_INVALID";
    if (status === 400 && ["SUBMISSION_SNAPSHOTS_REQUIRED", "INVALID_SUBMISSION_SNAPSHOTS"].includes(message))
      return "REVIEW_FROZEN_SNAPSHOTS_REQUIRED";
  }
  if (path === "submissions") {
    if (status === 409 && message === "LAB_SUBMISSION_ALREADY_PASSED") return "SUBMISSION_LAB_PASSED";
    if ((status === 422 || status === 400) && message === "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED")
      return "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED";
    if (status === 400 && message === "SUBMISSION_SNAPSHOT_IDS_INVALID")
      return "SUBMISSION_SNAPSHOT_IDS_INVALID";
    if ((status === 422 || status === 400) && message === "STEP_4_SIGNED_RUNTIME_RECEIPT")
      return "SUBMISSION_STUDIO_RECEIPT_REQUIRED";
    if (status === 403 && message === "Pass the current Lab Quiz before submitting")
      return "SUBMISSION_QUIZ_REQUIRED";
    if (status === 400 && message === "Đã quá hạn nộp bài cho đề bài này")
      return "SUBMISSION_DEADLINE";
    if (status === 400 && message === "Dự án không thuộc về không gian làm việc của đề bài")
      return "SUBMISSION_SCOPE";
    if (status === 403 && message === "Chỉ chủ sở hữu của dự án mới có quyền nộp bài")
      return "SUBMISSION_OWNER";
    if (
      status === 400 &&
      message ===
        "Không thể nộp phiên bản mô hình chưa hoàn thiện (PARTIAL) trừ khi đã được xác nhận"
    )
      return "SUBMISSION_PARTIAL";
    if (status === 400 && message === "Phiên bản mô hình không thuộc về dự án đã chọn")
      return "SUBMISSION_MODEL_MISMATCH";
    if (status === 400 && message === "ModelVersion không gắn với SourceSnapshot bất biến hợp lệ")
      return "SUBMISSION_SNAPSHOT_MISSING";
    if (status === 400 && message === "Bản vẽ sơ đồ không thuộc về phiên bản mô hình đã chọn")
      return "SUBMISSION_DIAGRAM_MISMATCH";
    if (status === 400 && message.startsWith("Missing required diagram type:"))
      return "SUBMISSION_REQUIRED_DIAGRAM";
    if (
      status === 400 &&
      message === "Kết quả chấm quy tắc kiến trúc không thuộc về phiên bản mô hình đã chọn"
    )
      return "SUBMISSION_EVALUATION_MISMATCH";
    if (
      status === 400 &&
      (message === "Phiên thực nghiệm không thuộc về dự án đã chọn" ||
        message === "Phiên thực nghiệm không chạy trên cùng SourceSnapshot với ModelVersion" ||
        message === "Phiên thực nghiệm không khớp với phiên thực nghiệm gắn trên ModelVersion")
    )
      return "SUBMISSION_RUNTIME_MISMATCH";
    if (
      status === 400 &&
      (message === "Đề bài này bắt buộc đính kèm phiên chạy thực nghiệm Runtime Trace" ||
        message ===
          "Đề bài yêu cầu Runtime Trace hợp lệ đã hoàn tất (PASSED) trên đúng SourceSnapshot của mô hình")
    )
      return "SUBMISSION_RUNTIME_REQUIRED";
  }
  if (message === "Run a verified Studio validation session before freezing this Lab's exercise")
    return "STUDIO_VALIDATION_REQUIRED";
  if (message === "Publish the Lab before freezing its Studio topology")
    return "STUDIO_PUBLISH_FIRST";
  if (message === "Studio session has no verified Stop/Start/Scale evidence")
    return "STUDIO_EVIDENCE_MISSING";
  if (message === "The reference runtime profile has no prepared Studio topology for this source/model")
    return "STUDIO_TOPOLOGY_MISSING";
  if (message.startsWith("Invalid prepared Studio topology"))
    return "STUDIO_TOPOLOGY_INVALID";
  if (message === "Profile must be a bounded object without literal secrets")
    return "RUNTIME_PROFILE_INVALID";
  if (
    message ===
    "Add a Lab description, attach a Theory lesson, or pin a published Reference Source before publishing the Lab"
  )
    return "LAB_PUBLISH_CONTENT_REQUIRED";
  if (path === "workspaces" && status === 400 && message.startsWith("Mã lớp học đã tồn tại"))
    return "WORKSPACE_CODE_EXISTS";
  if (status === 400 && message === "Người dùng đã là thành viên của lớp học này")
    return "WORKSPACE_MEMBER_EXISTS";
  if (status === 400 && message === "Không thể xóa người tạo khỏi lớp học")
    return "WORKSPACE_CREATOR_PROTECTED";
  if (status === 409 && (message === "This workspace is archived" || message === "Workspace is archived"))
    return "WORKSPACE_ARCHIVED";
  if (status === 400 && message.startsWith("Không thể xóa đề bài tập đã có sinh viên nộp bài"))
    return "ASSIGNMENT_HAS_SUBMISSIONS";
  if (status === 409 && message === "Published Labs are part of the course roadmap")
    return "ASSIGNMENT_PUBLISHED_PROTECTED";
  if (status === 409 && message === "A published Lab keeps its pinned source")
    return "ASSIGNMENT_PINNED_SOURCE";
  if (status === 409 && message.startsWith("Email đã tồn tại trong hệ thống"))
    return "ACCOUNT_EMAIL_EXISTS";
  return undefined;
}
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
    public readonly retryAfter?: number,
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
