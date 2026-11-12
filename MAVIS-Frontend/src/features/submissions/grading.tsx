"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery, usePermission } from "@/hooks/use-api";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { FormField } from "@/components/shared/forms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Response } from "@/lib/api/contracts";

const PASSING_SCORE = 50;

function reviewOutcome(score: number | null) {
  if (score === null) return null;
  return score > PASSING_SCORE ? "PASS" : "NEEDS REVISION";
}

export function GradingPanel({ submissionId }: { submissionId: string }) {
  const canReview = usePermission("submission:review");
  const query = useApiQuery(
    "submissionReview",
    { submissionId },
    { refreshMs: canReview ? 60000 : 15000 },
  );
  return (
    <DetailPanel title="Lecturer review & grade">
      <RequestState query={query}>
        {query.data && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge
                status={query.data.status}
                variant={
                  query.data.status === "GRADED"
                    ? "success"
                    : query.data.status === "RETURNED"
                      ? "warning"
                      : "outline"
                }
              />
              {query.data.score !== null && (
                <span className="text-xl font-semibold">{query.data.score} / 100</span>
              )}
              {reviewOutcome(query.data.score) && (
                <Badge variant={query.data.score! > PASSING_SCORE ? "success" : "warning"}>
                  {reviewOutcome(query.data.score)}
                </Badge>
              )}
            </div>
            {query.data.status === "PENDING" && (
              <p className="text-sm text-muted-foreground">
                Awaiting lecturer review. Inline feedback may be available below.
              </p>
            )}
            {query.data.summary && (
              <p className="whitespace-pre-wrap break-words text-sm">{query.data.summary}</p>
            )}
            {query.data.status === "RETURNED" && (
              <p className="text-sm text-muted-foreground">
                Apply the requested changes in your working project, save the new model/diagram
                revisions and submit again from the assignment. This submission remains unchanged.
              </p>
            )}
            {query.data.updatedAt && (
              <p className="text-xs text-muted-foreground">
                {query.data.lecturerName} · {new Date(query.data.updatedAt).toLocaleString()}
              </p>
            )}
            {canReview && <GradeForm key={query.data.revision} review={query.data} />}
            <Button
              size="sm"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Refresh review
            </Button>
          </div>
        )}
      </RequestState>
    </DetailPanel>
  );
}
function GradeForm({ review }: { review: Response<"submissionReview"> }) {
  const save = useApiMutation("gradeSubmission");
  const [score, setScore] = useState(review.score === null ? "" : String(review.score)),
    [summary, setSummary] = useState(review.summary);
  const value = score.trim() === "" ? null : Number(score),
    valid =
      value === null ||
      (Number.isFinite(value) && value >= 0 && value <= 100 && /^\d+(\.\d{1,2})?$/.test(score));
  const outcome = reviewOutcome(value);
  function submit(status: "DRAFT" | "RETURNED" | "GRADED") {
    if (!valid || (status !== "DRAFT" && !summary.trim())) return;
    if (status === "GRADED" && (value === null || value <= PASSING_SCORE)) return;
    if (status === "RETURNED" && value !== null && value > PASSING_SCORE) return;
    if (
      status !== "DRAFT" &&
      !window.confirm(
        status === "GRADED"
          ? "Publish this score and summary to the student?"
          : "Return this submission with change requests?",
      )
    )
      return;
    save.mutate({
      submissionId: review.submissionId,
      expectedRevision: review.revision,
      status,
      score: value,
      summary,
    });
  }
  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">
        The lecturer grade is separate from automated architecture compliance. Draft reviews are
        private; inline comments below are immediately visible to the student. The current backend
        stores one overall score out of 100: above 50 passes, while 50 or below needs revision.
      </p>
      <FormField label="Lecturer score (out of 100)">
        {(props) => (
          <Input
            {...props}
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="max-w-48"
          />
        )}
      </FormField>
      <FormField label="Overall review / changes requested">
        {(props) => (
          <Textarea
            {...props}
            value={summary}
            maxLength={10000}
            onChange={(e) => setSummary(e.target.value)}
          />
        )}
      </FormField>
      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          Enter a score between 0 and 100 with at most two decimal places.
        </p>
      )}
      {valid && outcome && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Calculated outcome</span>
          <Badge variant={value! > PASSING_SCORE ? "success" : "warning"}>{outcome}</Badge>
        </div>
      )}
      {!summary.trim() && value !== null && (
        <p role="status" className="text-sm text-muted-foreground">
          Add an overall review before publishing or returning this snapshot.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={save.isPending || !valid}
          onClick={() => submit("DRAFT")}
        >
          Save grading draft
        </Button>
        <Button
          variant="outline"
          disabled={
            save.isPending || !valid || !summary.trim() || (value !== null && value > PASSING_SCORE)
          }
          onClick={() => submit("RETURNED")}
        >
          Return for changes
        </Button>
        <Button
          disabled={
            save.isPending || !valid || value === null || value <= PASSING_SCORE || !summary.trim()
          }
          onClick={() => submit("GRADED")}
        >
          Publish grade
        </Button>
      </div>
      {save.error && <ErrorState error={save.error} />}
    </div>
  );
}
