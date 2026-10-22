import { StatusBadge } from "@/components/shared/data";
import type { AnalysisJob } from "@/types/domain";
export function AnalysisStatusIndicator({ job }: { job: AnalysisJob }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <StatusBadge
        status={job.status}
        variant={
          job.status === "completed" ? "success" : job.status === "failed" ? "destructive" : "info"
        }
      />
      <progress
        max={100}
        value={job.progress ?? undefined}
        aria-label="Analysis progress"
        className="h-2 w-full accent-primary"
      />
      {job.workerStatus && (
        <p className="text-xs text-muted-foreground">C# Worker: {job.workerStatus}</p>
      )}
      <p className="text-sm text-muted-foreground">
        {job.progress === null ? "Progress not reported" : `${job.progress}%`} · {job.message}
      </p>
    </div>
  );
}
