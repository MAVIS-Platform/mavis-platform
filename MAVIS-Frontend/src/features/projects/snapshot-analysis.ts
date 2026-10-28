import type { ApiAdapter } from "@/lib/api/contracts";
import type { AnalysisJob } from "@/types/domain";

export const analysisInProgress = (job: Pick<AnalysisJob, "status">) =>
  ["queued", "processing", "cancelling"].includes(job.status);

export function snapshotAnalysisLabel(job: AnalysisJob | undefined, hasRevision: boolean) {
  if (job && analysisInProgress(job))
    return job.status === "cancelling" ? "Cancelling…" : "Analyzing…";
  if (job && ["failed", "cancelled", "timed-out"].includes(job.status)) return "Retry";
  return hasRevision ? "Re-analyze" : "Analyze";
}

export type SnapshotAnalysisRequest = {
  projectId: string;
  snapshotId: string;
  idempotencyKey: string;
};

export async function startSnapshotAnalysis(api: ApiAdapter, request: SnapshotAnalysisRequest) {
  // Reuse the stored snapshot. Never import or resolve a branch again here.
  const job = await api.execute("startAnalysis", request);
  if (job.projectId !== request.projectId || job.snapshotId !== request.snapshotId) {
    throw new Error("Analysis job does not match this project snapshot.");
  }
  return job;
}
