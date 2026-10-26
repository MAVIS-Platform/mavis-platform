"use client";
import { useState } from "react";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { downloadArtifact } from "./frozen-artifacts";
import { SelectField } from "@/components/shared/forms";
import { FormField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation, useApiQuery, useSession, usePermission } from "@/hooks/use-api";
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
      <p className="text-sm">
        {submission.studentName || submission.studentId} ·{" "}
        {submission.assignmentTitle || submission.assignmentId}
      </p>
      <p className="break-all text-xs text-muted-foreground">
        Diagram {submission.diagramVersionId ?? "not loaded"} · Evaluation{" "}
        {submission.evaluationRunId ?? "not included"} · Compliance{" "}
        {submission.complianceScore ?? "not evaluated"}
      </p>
      {submission.submissionNotes && (
        <p className="whitespace-pre-wrap text-sm">{submission.submissionNotes}</p>
      )}
      <SubmissionExport submissionId={submission.id} />
      <p className="text-xs text-muted-foreground">
        Runtime: {submission.runtime ? submission.runtime.id : "Not included"}
      </p>
    </DetailPanel>
  );
}
export function FeedbackPanel({
  submission,
  selectedId,
}: {
  submission: Submission;
  selectedId?: string | null;
}) {
  const canReview = usePermission("submission:review");
  const save = useApiMutation("feedback");
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const node = submission.model.elements.find((n) => n.id === target),
    edge = submission.model.edges.find((e) => e.id === target);
  return (
    <DetailPanel title="Feedback on this submission version">
      {submission.feedback.length ? (
        <ul className="space-y-3">
          {submission.feedback.map((feedback) => (
            <li key={feedback.id} className="rounded-lg border p-3">
              <p className="whitespace-pre-wrap text-sm">{feedback.text}</p>
              <p className="text-xs text-muted-foreground">
                {feedback.elementId
                  ? `Element: ${submission.model.elements.find((e) => e.id === feedback.elementId)?.name ?? feedback.elementId}`
                  : feedback.relationshipId
                    ? `Relationship: ${feedback.relationshipId}`
                    : "General submission feedback"}
              </p>
              <FeedbackActions feedback={feedback} submissionId={submission.id} />
              <p className="mt-2 text-xs text-muted-foreground">
                {feedback.createdAt} · {feedback.authorName || feedback.authorId}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No feedback saved for this submission.</p>
      )}
      {canReview && (
        <>
          <p className="text-xs text-muted-foreground">Inline feedback is visible to the student immediately. Use the private grading draft above for notes you are not ready to publish.</p>
          <SelectField
            label="Feedback target"
            value={target}
            onChange={setTarget}
            options={[
              { value: "", label: "General feedback" },
              ...submission.model.elements.map((e) => ({
                value: e.id,
                label: `Element · ${e.name}`,
              })),
              ...submission.model.edges.map((e) => ({
                value: e.id,
                label: `Relationship · ${e.protocol} · ${e.id}`,
              })),
            ]}
          />
          {selectedId && (
            <Button variant="outline" size="sm" onClick={() => setTarget(selectedId)}>
              Use selected graph item
            </Button>
          )}
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
                {
                  submissionId: submission.id,
                  modelId: submission.model.id,
                  text,
                  elementId: node?.id ?? null,
                  relationshipId: edge?.id ?? null,
                },
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

function SubmissionExport({ submissionId }: { submissionId: string }) {
  const query = useApiQuery("submissionExport", { submissionId }, { enabled: false });
  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        disabled={query.isFetching}
        onClick={async () => {
          const result = await query.refetch();
          if (result.data)
            downloadArtifact(
              `submission-${submissionId}.json`,
              JSON.stringify(result.data, null, 2),
            );
        }}
      >
        Export frozen submission bundle
      </Button>
      {query.error && <ErrorState error={query.error} />}
    </div>
  );
}
function FeedbackActions({
  feedback,
  submissionId,
}: {
  feedback: Submission["feedback"][number];
  submissionId: string;
}) {
  const session = useSession(),
    update = useApiMutation("updateFeedback"),
    remove = useApiMutation("deleteFeedback");
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(feedback.text);
  if (session.data?.user?.id !== feedback.authorId) return null;
  return (
    <div className="mt-2 space-y-2">
      {editing && (
        <Textarea
          aria-label="Edit feedback text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
        />
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={update.isPending || !text.trim()}
          onClick={() =>
            editing
              ? update.mutate(
                  { submissionId, feedbackId: feedback.id, text },
                  { onSuccess: () => setEditing(false) },
                )
              : setEditing(true)
          }
        >
          {editing ? "Save feedback changes" : "Edit feedback"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm("Delete your feedback?"))
              remove.mutate({ submissionId, feedbackId: feedback.id });
          }}
        >
          Delete feedback
        </Button>
      </div>
      {(update.error || remove.error) && <ErrorState error={update.error ?? remove.error} />}
    </div>
  );
}
