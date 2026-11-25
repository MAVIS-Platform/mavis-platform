"use client";
import { useState } from "react";
import Link from "next/link";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { downloadArtifact } from "./frozen-artifacts";
import { stripLegacySubmissionNoise } from "./submission-text";
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
  const { locale, t } = useLocale();
  const canReview = usePermission("submission:review");
  const quiz = submission.courseQuizEvidence;
  const isStudioLab =
    submission.labMode === "THEORY_QUIZ_STUDIO" ||
    Boolean(submission.studioEvidence || submission.runtime?.studioVerified);
  // Studio Labs without a per-Lab quiz have quiz.status === "NOT_REQUIRED" but must never show "Theory Only".
  const isTheoryOnly =
    !isStudioLab &&
    (submission.labMode === "THEORY_ONLY" ||
      (quiz?.status === "NOT_REQUIRED" && submission.labMode !== "THEORY_QUIZ"));
  const requiresRuntime =
    !isTheoryOnly &&
    submission.labMode !== "THEORY_QUIZ";
  const labLabel = formatCourseLabTitle(
    submission.assignmentTitle,
    submission.labOrder,
    submission.assignmentId,
  );
  const formattedSubmittedAt = (() => {
    const d = new Date(submission.submittedAt);
    if (Number.isNaN(d.getTime())) return submission.submittedAt;
    return d.toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  })();
  const cleanedNotes = submission.submissionNotes
    ? stripLegacySubmissionNoise(submission.submissionNotes)
    : "";
  const isNotesDuplicated =
    Boolean(cleanedNotes) &&
    (submission.studentSnapshots ?? []).some(
      (snap) =>
        snap.writtenExplanation &&
        stripLegacySubmissionNoise(snap.writtenExplanation) === cleanedNotes,
    );
  const displayNotes = isNotesDuplicated ? "" : cleanedNotes;
  const studioEval =
    submission.studioEvidence &&
    typeof submission.studioEvidence["exerciseEvaluation"] === "object" &&
    submission.studioEvidence["exerciseEvaluation"] !== null
      ? (submission.studioEvidence["exerciseEvaluation"] as Record<string, unknown>)
      : null;
  const studioF1 =
    studioEval && typeof studioEval["f1"] === "number"
      ? Math.round(studioEval["f1"] * 100)
      : studioEval && typeof studioEval["f1Score"] === "number"
        ? Math.round(studioEval["f1Score"] * 100)
        : null;

  if (!canReview) {
    return (
      <DetailPanel title={t("Submission Dossier", "Hồ sơ bài nộp")}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={t("Submitted", "Bài đã nộp")}
            preserveCase
            variant="source"
          />
          {isTheoryOnly ? (
            <StatusBadge
              status={t("Theory Only", "Chỉ lý thuyết")}
              preserveCase
              variant="outline"
            />
          ) : submission.labMode ? (
            <StatusBadge
              status={formatLabModeLabel(submission.labMode, t)}
              preserveCase
              variant="outline"
            />
          ) : null}
          {(submission.runtime?.studioVerified || Boolean(submission.studioEvidence)) && (
            <StatusBadge
              status={t("Studio Live Verified", "Đã xác minh Studio Live")}
              preserveCase
              variant="success"
            />
          )}
        </div>
        <p className="text-sm font-semibold text-foreground">
          {submission.workspaceName ? `${submission.workspaceName} · ` : ""}
          {labLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {submission.studentName || submission.studentId} · {t("Submitted", "Đã nộp")}{" "}
          {formattedSubmittedAt}
          {submission.complianceScore !== null && submission.complianceScore !== undefined
            ? ` · ${t("Compliance", "Tuân thủ 3E")}: ${submission.complianceScore}`
            : ""}
        </p>
        {displayNotes && (
          <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm leading-relaxed">
            {displayNotes}
          </p>
        )}
        {quiz && quiz.status === "PASSED" && quiz.correctCount != null && quiz.questionCount != null && (
          <p className="text-sm">
            {t("Lab Quiz passed", "Đã đạt Quiz của Lab")} · {quiz.correctCount}/{quiz.questionCount}
          </p>
        )}
        <SubmissionExport submissionId={submission.id} />
      </DetailPanel>
    );
  }

  return (
    <DetailPanel title={t("Submission overview", "Thông tin bài nộp")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={t("Submitted", "Bài đã nộp")}
              preserveCase
              variant="source"
            />
            {isTheoryOnly ? (
              <StatusBadge
                status={t("Theory Only", "Chỉ lý thuyết")}
                preserveCase
                variant="outline"
              />
            ) : submission.labMode ? (
              <StatusBadge
                status={formatLabModeLabel(submission.labMode, t)}
                preserveCase
                variant="outline"
              />
            ) : null}
            {(submission.runtime?.studioVerified || Boolean(submission.studioEvidence)) && (
              <StatusBadge
                status={t("Studio Live Verified", "Đã xác minh Studio Live")}
                preserveCase
                variant="success"
              />
            )}
            {studioF1 !== null && (
              <StatusBadge
                status={`Impact F1: ${studioF1}%`}
                preserveCase
                variant={studioF1 >= 70 ? "success" : "warning"}
              />
            )}
          </div>
          <p className="text-base font-semibold text-foreground">{labLabel}</p>
          <p className="text-xs text-muted-foreground">
            {submission.studentName || submission.studentId} · {t("Submitted", "Đã nộp")}{" "}
            {formattedSubmittedAt}
          </p>
        </div>
        <SubmissionExport submissionId={submission.id} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {quiz && quiz.status === "PASSED" && quiz.correctCount != null && quiz.questionCount != null && (
          <span className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-800 dark:text-emerald-300">
            {t("Lab Quiz passed", "Đã đạt Quiz của Lab")} · {quiz.correctCount}/{quiz.questionCount}
            {quiz.questionCount > 0
              ? ` (${Math.round((quiz.correctCount / quiz.questionCount) * 100)}%)`
              : ""}
          </span>
        )}
        {submission.complianceScore !== null && submission.complianceScore !== undefined && (
          <span className="inline-flex items-center rounded-lg border bg-muted/40 px-2.5 py-1 font-medium text-foreground">
            {t("Compliance", "Tuân thủ 3E")}: {submission.complianceScore}
          </span>
        )}
        {submission.runtime ? (
          <Link
            className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
            href={`/sessions?${new URLSearchParams({
              project: submission.runtime.projectId,
              session: submission.runtime.id,
            })}`}
          >
            {submission.runtime.studioVerified
              ? t("View verified Studio session", "Xem phiên thực hành Studio")
              : t("View Runtime session", "Xem phiên chạy Runtime")}
          </Link>
        ) : !submission.studioEvidence && requiresRuntime ? (
          <span className="inline-flex items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-800 dark:text-amber-300">
            {t("No runtime evidence attached", "Chưa đính kèm minh chứng Runtime")}
          </span>
        ) : null}
      </div>

      {displayNotes && (
        <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm leading-relaxed">
          {displayNotes}
        </p>
      )}
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
        className="border-slate-300 bg-card text-foreground hover:bg-accent dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-700/80"
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
