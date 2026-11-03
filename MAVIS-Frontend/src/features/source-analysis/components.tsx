import { StatusBadge, StatusLabel } from "@/components/shared/data";
import type { AnalysisJob } from "@/types/domain";
import { useLocale } from "@/lib/i18n/locale-context";

export function formatAnalysisJobMessage(job: AnalysisJob): string {
  const raw = (job.message || job.analysisState || job.status || "").trim();
  switch (raw.toUpperCase()) {
    case "COMPLETED_WITH_REVIEW":
      return "Completed · Ready for architecture review";
    case "COMPLETED":
      return "Analysis completed successfully";
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

export function AnalysisStatusIndicator({
  job,
  compact = false,
}: {
  job: AnalysisJob;
  compact?: boolean;
}) {
  const { t } = useLocale();
  const isActive =
    job.status === "processing" || job.status === "queued" || job.status === "cancelling";
  const showWorker =
    Boolean(job.workerStatus) &&
    job.workerStatus !== "NOT_APPLICABLE" &&
    job.workerStatus !== "NONE";
  const summary = formatAnalysisJobMessage(job);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <StatusBadge
          status={job.status}
          variant={
            job.status === "completed"
              ? "success"
              : job.status === "failed"
                ? "destructive"
                : "info"
          }
        />
        <span className="text-xs text-muted-foreground">
          {job.progress !== null ? `${job.progress}% · ` : ""}
          {t(summary)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge
          status={job.status}
          variant={
            job.status === "completed"
              ? "success"
              : job.status === "failed"
                ? "destructive"
                : "info"
          }
        />
        {showWorker && (
          <span className="font-mono text-xs text-muted-foreground">
            {t("Worker:")} <StatusLabel status={job.workerStatus ?? ""} />
          </span>
        )}
      </div>
      {(isActive || job.progress !== null) && (
        <progress
          max={100}
          value={job.progress ?? undefined}
          aria-label="Analysis progress"
          className="h-2 w-full accent-primary"
        />
      )}
      <p className="text-xs text-muted-foreground">
        {job.progress !== null ? `${job.progress}% · ` : ""}
        {t(summary)}
      </p>
    </div>
  );
}
