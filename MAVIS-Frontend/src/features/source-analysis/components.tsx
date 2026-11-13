import { StatusBadge, StatusLabel } from "@/components/shared/data";
import type { AnalysisJob } from "@/types/domain";
import { useLocale } from "@/lib/i18n/locale-context";
import { analysisStatusBadgeProps, formatAnalysisJobMessage } from "./status";

export { analysisStatusBadgeProps, formatAnalysisJobMessage };

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
  const badge = analysisStatusBadgeProps(job);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <StatusBadge status={badge.status} variant={badge.variant} />
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
        <StatusBadge status={badge.status} variant={badge.variant} />
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
