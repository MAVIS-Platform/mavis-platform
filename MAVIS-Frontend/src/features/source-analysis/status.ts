import type { BadgeProps } from "@/components/ui/badge";
import type { AnalysisJob } from "@/types/domain";

export function formatAnalysisJobMessage(job: AnalysisJob): string {
  const derivedState = (job.analysisState || "").trim().toUpperCase();
  const raw = (job.message || derivedState || job.status || "").trim();
  const token = raw.toUpperCase();
  switch (token) {
    case "COMPLETED_WITH_REVIEW":
      return "Completed · Ready for architecture review";
    case "COMPLETED_LEGACY":
      return "Completed · Legacy static model";
    case "COMPLETED":
      return derivedState === "COMPLETED_WITH_REVIEW"
        ? "Completed · Ready for architecture review"
        : derivedState === "COMPLETED_LEGACY"
          ? "Completed · Legacy static model"
          : derivedState === "PARTIAL"
            ? "Partial extraction completed"
            : "Analysis completed successfully";
    case "ANALYSIS_OR_PUBLICATION_FAILED":
      return "Analysis or model publication failed";
    case "FAILED":
      return "Analysis failed";
    case "PARTIAL":
      return "Partial extraction completed";
    case "RUNNING":
    case "PROCESSING":
      return "Static analysis in progress…";
    case "QUEUED":
    case "PENDING":
      return "Queued for analysis…";
    default:
      return raw || "Status recorded";
  }
}

export function analysisStatusBadgeProps(job: AnalysisJob): {
  status: string;
  variant: BadgeProps["variant"];
} {
  if (job.status === "failed" || job.status === "timed-out") {
    return { status: job.status, variant: "destructive" };
  }
  const derivedState = (job.analysisState || "").trim().toUpperCase();
  if (job.status === "partial" || derivedState === "PARTIAL") {
    return { status: "partial", variant: "warning" };
  }
  if (derivedState === "COMPLETED_WITH_REVIEW") {
    return { status: "completed (review)", variant: "warning" };
  }
  if (derivedState === "COMPLETED_LEGACY") {
    return { status: "completed (legacy)", variant: "warning" };
  }
  if (job.status === "completed") {
    return { status: "completed", variant: "success" };
  }
  return { status: job.status, variant: "info" };
}
