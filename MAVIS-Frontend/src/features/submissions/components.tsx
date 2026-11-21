"use client";
import { useState } from "react";
import Link from "next/link";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { downloadArtifact } from "./frozen-artifacts";
import { SelectField } from "@/components/shared/forms";
import { FormField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation, useApiQuery, useSession, usePermission } from "@/hooks/use-api";
import type { Submission } from "@/types/domain";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatCourseLabTitle, formatLabModeLabel } from "@/lib/format/course-display";
export function SubmissionVersionHeader({ submission }: { submission: Submission }) {
  const { t } = useLocale();
  const canReview = usePermission("submission:review");
  const quiz = submission.courseQuizEvidence;
  const labLabel = formatCourseLabTitle(
    submission.assignmentTitle,
    submission.labOrder,
    submission.assignmentId,
  );

  if (!canReview) {
    return (
      <DetailPanel title={t("Submission Dossier", "Hồ sơ bài nộp")}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={t("Frozen submitted dossier · read-only", "Hồ sơ đã khóa · chỉ đọc")}
            variant="source"
          />
          {submission.labMode && (
            <StatusBadge
              status={formatLabModeLabel(submission.labMode, t)}
              preserveCase
              variant="outline"
            />
          )}
          {submission.runtime?.studioVerified && (
            <StatusBadge
              status={t("Studio Live Verified", "Đã xác minh Studio Live")}
              variant="success"
            />
          )}
        </div>
        <p className="text-sm font-medium">
          {submission.workspaceName ? `${submission.workspaceName} · ` : ""}
          {labLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {submission.studentName || submission.studentId} · {t("Submitted", "Đã nộp")}{" "}
          {submission.submittedAt}
          {submission.complianceScore !== null && submission.complianceScore !== undefined
            ? ` · ${t("Compliance", "Tuân thủ 3E")}: ${submission.complianceScore}`
            : ""}
        </p>
        {submission.submissionNotes && (
          <p className="whitespace-pre-wrap text-sm">{submission.submissionNotes}</p>
        )}
        {quiz && quiz.status === "PASSED" && quiz.correctCount != null && quiz.questionCount != null && (
          <p className="text-sm">
            {t("Lab Quiz passed", "Đã đạt Quiz của Lab")} · {quiz.correctCount}/{quiz.questionCount}
            {" · "}
            {t("Version", "Phiên bản")} {quiz.quizVersion ?? 1}
          </p>
        )}
        {quiz && quiz.status === "NOT_REQUIRED" && (
          <p className="text-sm">
            {t("Theory-only Lab (no Quiz required)", "Lab chỉ lý thuyết (không yêu cầu Quiz)")}
          </p>
        )}
        <SubmissionExport submissionId={submission.id} />
      </DetailPanel>
    );
  }

  return (
    <DetailPanel title={t("Submitted snapshot", "Hồ sơ bài nộp đã khóa")}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          status={t("Frozen submitted results · read-only", "Kết quả nộp đã khóa · chỉ đọc")}
          variant="source"
        />
        {submission.labMode && (
          <StatusBadge
            status={formatLabModeLabel(submission.labMode, t)}
            preserveCase
            variant="outline"
          />
        )}
      </div>
      <p className="break-all text-xs text-muted-foreground">
        {t("Submission", "Bài nộp")} {submission.id} · {t("submitted", "đã nộp")}{" "}
        {submission.submittedAt}
      </p>
      <p className="break-all text-sm">
        {t("Model", "Mô hình")} {submission.model.id} · {t("revision", "bản")} {submission.model.revision} ·{" "}
        {t("source", "nguồn")} {submission.snapshot.id}
      </p>
      <p className="text-sm">
        {submission.studentName || submission.studentId} ·{" "}
        {formatCourseLabTitle(
          submission.assignmentTitle,
          submission.labOrder,
          submission.assignmentId,
        )}
      </p>
      {submission.diagramVersionId || submission.evaluationRunId ? (
        <p className="break-all text-xs text-muted-foreground">
          {t("Diagram", "Sơ đồ")}: {submission.diagramVersionId ?? t("none attached", "không có")} ·{" "}
          {t("Evaluation", "Đánh giá tĩnh")}: {submission.evaluationRunId ?? t("none attached", "không có")} ·{" "}
          {t("Compliance", "Tuân thủ 3E")}: {submission.complianceScore ?? t("not evaluated", "chưa đánh giá")}
        </p>
      ) : (
        <p className="break-all text-xs text-muted-foreground">
          {submission.labMode
            ? `${t("Lab mode", "Chế độ Lab")}: ${formatLabModeLabel(submission.labMode, t)} · `
            : ""}
          {t("Compliance", "Tuân thủ 3E")}:{" "}
          {submission.complianceScore ?? t("not evaluated", "chưa đánh giá")}
        </p>
      )}
      {submission.submissionNotes && (
        <p className="whitespace-pre-wrap text-sm">{submission.submissionNotes}</p>
      )}
      {quiz && quiz.status === "PASSED" && quiz.correctCount != null && quiz.questionCount != null && (
        <p className="text-sm">
          {t("Lab Quiz passed", "Đã đạt Quiz của Lab")} · {quiz.correctCount}/{quiz.questionCount}
          {" · "}
          {t("Version", "Phiên bản")} {quiz.quizVersion ?? 1}
        </p>
      )}
      {quiz && quiz.status === "NOT_REQUIRED" && (
        <p className="text-sm">
          {t("Theory-only Lab (no Quiz required)", "Lab chỉ lý thuyết (không yêu cầu Quiz)")}
        </p>
      )}
      <SubmissionExport submissionId={submission.id} />
      <p className="text-xs text-muted-foreground">
        {submission.runtime ? (
          <Link
            className="underline"
            href={`/sessions?${new URLSearchParams({
              project: submission.runtime.projectId,
              session: submission.runtime.id,
            })}`}
          >
            {submission.runtime.studioVerified
              ? t("Verified Studio evidence", "Minh chứng Studio đã xác minh")
              : t("Runtime evidence", "Minh chứng Runtime")}{" "}
            · {submission.runtime.id.slice(0, 8)}
          </Link>
        ) : (
          t("No runtime evidence attached", "Chưa đính kèm minh chứng Runtime")
        )}
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
  const { t } = useLocale();
  const canReview = usePermission("submission:review");
  const save = useApiMutation("feedback");
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const node = submission.model.elements.find((n) => n.id === target),
    edge = submission.model.edges.find((e) => e.id === target);
  return (
    <DetailPanel title={t("Feedback on this submission version", "Nhận xét cho bản nộp này")}>
      {submission.feedback.length ? (
        <ul className="space-y-3">
          {submission.feedback.map((feedback) => (
            <li key={feedback.id} className="rounded-lg border p-3">
              <p className="whitespace-pre-wrap text-sm">{feedback.text}</p>
              <p className="text-xs text-muted-foreground">
                {feedback.elementId
                  ? `${t("Element", "Thành phần")}: ${submission.model.elements.find((e) => e.id === feedback.elementId)?.name ?? feedback.elementId}`
                  : feedback.relationshipId
                    ? `${t("Relationship", "Quan hệ")}: ${feedback.relationshipId}`
                    : t("General submission feedback", "Nhận xét chung cho bài nộp")}
              </p>
              <FeedbackActions feedback={feedback} submissionId={submission.id} />
              <p className="mt-2 text-xs text-muted-foreground">
                {feedback.createdAt} · {feedback.authorName || feedback.authorId}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("No feedback saved for this submission.", "Chưa có nhận xét nào cho bài nộp này.")}
        </p>
      )}
      {canReview && (
        <>
          <p className="text-xs text-muted-foreground">
            {t(
              "Inline feedback is visible to the student immediately. Use the private grading draft above for notes you are not ready to publish.",
              "Nhận xét trực tiếp sẽ hiển thị cho sinh viên ngay lập tức. Hãy dùng bản nháp chấm điểm nếu chưa muốn công bố.",
            )}
          </p>
          {(() => {
            const elementNameById = new Map(
              submission.model.elements.map((e) => [e.id, e.name] as const),
            );
            return (
              <SelectField
                label={t("Feedback target", "Đối tượng nhận xét")}
                value={target}
                onChange={setTarget}
                options={[
                  { value: "", label: t("General feedback", "Nhận xét chung") },
                  ...submission.model.elements.map((e) => ({
                    value: e.id,
                    label: `${t("Element", "Thành phần")} · ${e.name}`,
                  })),
                  ...submission.model.edges.map((e) => {
                    const fromName = elementNameById.get(e.from) ?? e.from.slice(0, 8);
                    const toName = elementNameById.get(e.to) ?? e.to.slice(0, 8);
                    return {
                      value: e.id,
                      label: `${t("Relationship", "Quan hệ")} · ${fromName} → ${toName} (${e.protocol})`,
                    };
                  }),
                ]}
              />
            );
          })()}
          {selectedId && (
            <Button variant="outline" size="sm" onClick={() => setTarget(selectedId)}>
              {t("Use selected graph item", "Dùng thành phần đồ thị đang chọn")}
            </Button>
          )}
          <FormField
            label={t("Review feedback", "Nội dung nhận xét")}
            hint={t(
              `Feedback is saved to submission ${submission.id}, model revision ${submission.model.revision}.`,
              `Nhận xét được lưu vào bài nộp ${submission.id}, phiên bản mô hình ${submission.model.revision}.`,
            )}
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
            {save.isPending ? t("Saving feedback…", "Đang lưu nhận xét…") : t("Save feedback", "Lưu nhận xét")}
          </Button>
          {save.isError && <ErrorState error={save.error} />}
        </>
      )}
    </DetailPanel>
  );
}

function SubmissionExport({ submissionId }: { submissionId: string }) {
  const { t } = useLocale();
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
        {t("Export frozen submission bundle", "Xuất gói hồ sơ bài nộp")}
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
  const { t } = useLocale();
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
          aria-label={t("Edit feedback text", "Sửa nội dung nhận xét")}
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
          {editing ? t("Save feedback changes", "Lưu thay đổi nhận xét") : t("Edit feedback", "Sửa nhận xét")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(t("Delete your feedback?", "Xóa nhận xét này?")))
              remove.mutate({ submissionId, feedbackId: feedback.id });
          }}
        >
          {t("Delete feedback", "Xóa nhận xét")}
        </Button>
      </div>
      {(update.error || remove.error) && <ErrorState error={update.error ?? remove.error} />}
    </div>
  );
}
