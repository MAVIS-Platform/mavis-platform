"use client";
import { useState } from "react";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { FormField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation, usePermission } from "@/hooks/use-api";
import type { Submission } from "@/types/domain";
export function SubmissionVersionHeader({ submission }: { submission: Submission }) {
  return (
    <DetailPanel title="Submitted snapshot">
      <StatusBadge status="Frozen submitted results · read-only" variant="source" />
      <p className="break-all text-xs text-muted-foreground">
        Submission {submission.id} · submitted {submission.submittedAt}
      </p>
      <p className="break-all text-sm">
        Model {submission.model.id} · revision {submission.model.revision} · source{" "}
        {submission.snapshot.id}
      </p>
      <p className="text-xs text-muted-foreground">
        Runtime: {submission.runtime ? submission.runtime.id : "Not included"}
      </p>
    </DetailPanel>
  );
}
export function FeedbackPanel({ submission }: { submission: Submission }) {
  const canReview = usePermission("submission:review");
  const save = useApiMutation("feedback");
  const [text, setText] = useState("");
  return (
    <DetailPanel title="Feedback on this submission version">
      {submission.feedback.length ? (
        <ul className="space-y-3">
          {submission.feedback.map((feedback) => (
            <li key={feedback.id} className="rounded-lg border p-3">
              <p className="whitespace-pre-wrap text-sm">{feedback.text}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {feedback.createdAt} · {feedback.authorId}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No feedback saved for this submission.</p>
      )}
      {canReview && (
        <>
          <FormField
            label="Review feedback"
            hint={`Feedback is saved to submission ${submission.id}, model revision ${submission.model.revision}.`}
          >
            {(props) => (
              <Textarea
                {...props}
                value={text}
                maxLength={5000}
                onChange={(e) => setText(e.target.value)}
                disabled={save.isPending}
              />
            )}
          </FormField>
          <Button
            disabled={!text.trim() || save.isPending}
            onClick={() =>
              save.mutate(
                { submissionId: submission.id, modelId: submission.model.id, text },
                { onSuccess: () => setText("") },
              )
            }
          >
            {save.isPending ? "Saving feedback…" : "Save feedback"}
          </Button>
          {save.isError && <ErrorState error={save.error} />}
        </>
      )}
    </DetailPanel>
  );
}
