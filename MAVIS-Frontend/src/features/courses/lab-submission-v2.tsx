"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { DetailPanel } from "@/components/shared/data";

export function LabSubmissionV2({
  workspaceId,
  assignmentId,
  labMode,
  runtimeSessionId,
}: {
  workspaceId: string;
  assignmentId: string;
  labMode: string;
  runtimeSessionId?: string | undefined;
}) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const submissions = useApiQuery("submissions", {});
  const submit = useApiMutation("submit");
  const [answer, setAnswer] = useState("");
  const [revising, setRevising] = useState(false);
  const studio = labMode === "THEORY_QUIZ_STUDIO";
  const mine = useMemo(
    () => (submissions.data ?? []).filter((item) => item.assignmentId === assignmentId),
    [submissions.data, assignmentId],
  );
  const latest = mine[0];
  const review = useApiQuery(
    "submissionReview",
    { submissionId: latest?.id ?? "" },
    { enabled: Boolean(latest) },
  );
  const canSubmit = answer.trim().length > 0 && (!studio || Boolean(runtimeSessionId));

  if (latest && !revising) {
    return (
      <div id="lab-submit">
      <DetailPanel title={t("Submission", "Bài nộp")}>
        <div className="space-y-2 rounded-lg border bg-emerald-500/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t("Submitted", "Đã nộp")} · {new Date(latest.submittedAt).toLocaleString()}
          </p>
          {latest.evidencePackageDigest && (
            <p className="break-all font-mono text-xs text-muted-foreground">
              {latest.evidencePackageDigest}
            </p>
          )}
          {review.data && review.data.status !== "PENDING" && review.data.status !== "DRAFT" && (
            <div className="rounded-md border bg-background p-3 text-xs">
              <p className="font-medium">
                {review.data.status === "RETURNED"
                  ? t("Returned for revision", "Trả lại để sửa")
                  : t("Published result", "Kết quả đã công bố")}
                {review.data.score !== null && ` · ${review.data.score}/100`}
              </p>
              {review.data.summary && <p className="mt-1 whitespace-pre-wrap">{review.data.summary}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/submissions?workspace=${encodeURIComponent(workspaceId)}`}>
                {t("View submission and grade", "Xem bài nộp và điểm")} <ArrowRight />
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRevising(true)}>
              {t("Revise and resubmit", "Sửa và nộp lại")}
            </Button>
          </div>
        </div>
      </DetailPanel>
      </div>
    );
  }

  return (
    <div id="lab-submit">
    <DetailPanel title={t("Submit your explanation", "Nộp phần giải trình")}>
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {studio
            ? t(
                "Explain what you observed in Studio and connect it to the theory. The verified Studio session is attached automatically.",
                "Giải thích điều bạn quan sát trong Studio và liên hệ với lý thuyết. Phiên Studio đã xác minh được đính kèm tự động.",
              )
            : t(
                "Explain the architecture and how the sample repository supports your answer. No diagram or model selection is required.",
                "Giải thích kiến trúc và cách repo mẫu chứng minh câu trả lời. Không cần chọn diagram hay model.",
              )}
        </p>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("Explanation", "Giải trình")}</span>
          <textarea
            className="min-h-40 w-full rounded-md border bg-background p-3 text-sm"
            value={answer}
            maxLength={20000}
            onChange={(event) => setAnswer(event.target.value)}
            aria-label={t("Submission explanation", "Giải trình bài nộp")}
          />
        </label>
        {studio && !runtimeSessionId && (
          <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
            {t(
              "Finish a verified Studio session for this Lab before submitting.",
              "Hoàn thành một phiên Studio đã xác minh cho Lab này trước khi nộp.",
            )}
          </p>
        )}
        {submit.error && (
          <p role="alert" className="text-sm text-destructive">
            {submit.error.message}
          </p>
        )}
        <Button
          type="button"
          disabled={!canSubmit || submit.isPending}
          onClick={() =>
            submit.mutate(
              {
                assignmentId,
                runtimeSessionId: studio ? runtimeSessionId! : null,
                submissionNotes: answer.trim(),
                theoryAnswers: [{ sectionId: "THEORY", title: "Theory explanation", answer: answer.trim() }],
                studentSnapshots: [],
              },
              {
                onSuccess: () => {
                  void cache.invalidateQueries({ queryKey: ["api", "submissions"] });
                  void cache.invalidateQueries({ queryKey: ["api", "submission"] });
                },
              },
            )
          }
        >
          {submit.isPending ? t("Submitting…", "Đang nộp…") : t("Submit Lab", "Nộp Lab")}
        </Button>
      </div>
    </DetailPanel>
    </div>
  );
}
