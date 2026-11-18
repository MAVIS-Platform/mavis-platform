"use client";

import { useState } from "react";
import { Check, ClipboardList, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { useApiMutation } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Assignment } from "./requirements";

export function LabInfoForm({
  workspaceId,
  assignment,
  onSaved,
}: {
  workspaceId: string;
  assignment?: Assignment | undefined;
  onSaved?: ((saved: Assignment) => void) | undefined;
}) {
  const { t } = useLocale();
  const save = useApiMutation(assignment ? "updateAssignment" : "createAssignment");
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [instructions, setInstructions] = useState(assignment?.instructions ?? "");
  const [due, setDue] = useState(
    assignment?.dueAt && assignment.dueAt !== "No deadline"
      ? new Date(
          new Date(assignment.dueAt).getTime() -
            new Date(assignment.dueAt).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
  );
  const [requireRuntimeTrace, setRequireRuntimeTrace] = useState(
    assignment?.requireRuntimeTrace ?? true,
  );
  const [labMode, setLabMode] = useState(
    assignment?.labMode ??
      (assignment?.requireRuntimeTrace === false ? "THEORY_QUIZ" : "THEORY_QUIZ_STUDIO"),
  );
  const [guideTab, setGuideTab] = useState<"write" | "preview">("write");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const payload: Record<string, unknown> = {
      workspaceId,
      ...(assignment ? { assignmentId: assignment.id } : {}),
      title: title.trim(),
      description: instructions,
      dueAt: due ? new Date(due).toISOString() : null,
      requireRuntimeTrace,
      labMode,
      requiredDiagramTypes: [],
      clearReferenceSource: false,
    };
    const referenceModelId = assignment?.referenceSource?.modelId;
    if (referenceModelId) payload["referenceModelId"] = referenceModelId;
    save.mutate(payload as Parameters<typeof save.mutate>[0], {
      onSuccess: (saved: Assignment) => {
        if (!assignment) {
          setTitle("");
          setInstructions("");
          setDue("");
          setRequireRuntimeTrace(true);
          setLabMode("THEORY_QUIZ_STUDIO");
        }
        onSaved?.(saved);
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="space-y-5 rounded-xl border bg-card p-5" aria-labelledby="lab-info-heading">
        <div className="flex items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" aria-hidden="true" />
            <h2 id="lab-info-heading" className="text-base font-semibold">
              {t("Lab information", "Thông tin Lab")}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{title.length}/255</span>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(15rem,0.6fr)]">
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t("Lab title", "Tên Lab")}</span>
            <Input
              aria-label="Assignment title"
              required
              maxLength={255}
              value={title}
              placeholder={t(
                "e.g. Service resilience and failure handling",
                "Ví dụ: Khả năng chịu lỗi và xử lý sự cố dịch vụ",
              )}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t("Due date (optional)", "Hạn nộp (không bắt buộc)")}</span>
            <Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="lab-instructions-input" className="text-sm font-medium">
              {t("Instructions, learning goals and completion criteria", "Hướng dẫn, mục tiêu và tiêu chí hoàn thành")}
            </label>
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setGuideTab("write")}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  guideTab === "write"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("Write", "Soạn thảo")}
              </button>
              <button
                type="button"
                onClick={() => setGuideTab("preview")}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  guideTab === "preview"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("Preview", "Xem trước")}
              </button>
            </div>
          </div>
          {guideTab === "write" ? (
            <Textarea
              id="lab-instructions-input"
              aria-label="Assignment instructions"
              maxLength={10000}
              rows={6}
              value={instructions}
              placeholder={t(
                "Describe the learning goal, what students should investigate, the required evidence and the completion criteria (Markdown supported).",
                "Nêu mục tiêu học tập, nội dung sinh viên cần khảo sát, bằng chứng cần nộp và tiêu chí hoàn thành (hỗ trợ Markdown).",
              )}
              onChange={(event) => setInstructions(event.target.value)}
            />
          ) : (
            <div className="min-h-36 rounded-lg border bg-background p-4 text-sm">
              {instructions.trim() ? (
                <MarkdownPreview markdown={instructions} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Formatted Markdown instructions for students appear here.",
                    "Bản hướng dẫn định dạng Markdown cho sinh viên hiển thị tại đây.",
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" aria-labelledby="lab-mode-heading">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Rocket className="size-4 text-primary" aria-hidden="true" />
              <h3 id="lab-mode-heading" className="text-sm font-semibold">
                {t("Lab mode", "Hình thức Lab")}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Students do not submit diagrams or a model version. C1–C3 are read-only theory content linked to the sample repository.",
                "Sinh viên không nộp diagram hay model version. C1–C3 là lý thuyết chỉ đọc gắn với repo mẫu.",
              )}
            </p>
          </div>
          <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              aria-pressed={requireRuntimeTrace}
              onClick={() => {
                setRequireRuntimeTrace(true);
                setLabMode("THEORY_QUIZ_STUDIO");
              }}
              title={t(
                "Adds a real MAVIS Studio Live practice and evidence step after the Quiz.",
                "Thêm bước thực hành MAVIS Studio Live thật và minh chứng sau Quiz.",
              )}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                requireRuntimeTrace
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Theory + Quiz + Studio", "Lý thuyết + Quiz + Studio")}
            </button>
            <button
              type="button"
              aria-pressed={!requireRuntimeTrace}
              onClick={() => {
                setRequireRuntimeTrace(false);
                setLabMode("THEORY_QUIZ");
              }}
              title={t(
                "Lesson, sample repository and C1–C3 reference views plus the Quiz gate. No runtime session.",
                "Bài học, repo mẫu và C1–C3 tham chiếu cùng Quiz gate. Không có phiên runtime.",
              )}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                !requireRuntimeTrace
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Theory + Quiz", "Lý thuyết + Quiz")}
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t(
            "Saving creates a draft Lab. Attach the reference source and publish it in the next steps.",
            "Lưu sẽ tạo Lab nháp. Gắn nguồn tham chiếu và công bố ở các bước tiếp theo.",
          )}
        </p>
        <Button disabled={save.isPending || !title.trim()}>
          {save.isPending
            ? t("Saving Lab draft…", "Đang lưu bản nháp Lab…")
            : assignment
              ? t("Save Lab changes", "Lưu thay đổi Lab")
              : t("Save Lab draft", "Lưu bản nháp Lab")}
          <ShieldCheck className="ml-1 size-4" aria-hidden="true" />
        </Button>
      </div>
      {save.error && <ErrorState error={save.error} />}
      {save.isSuccess && (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <Check className="size-4" aria-hidden="true" />
          {t("Lab draft saved.", "Đã lưu bản nháp Lab.")}
        </p>
      )}
    </form>
  );
}
