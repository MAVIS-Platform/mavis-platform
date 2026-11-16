"use client";

import { useState } from "react";
import { Check, ClipboardList, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
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
    assignment?.requireRuntimeTrace ?? false,
  );

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
          setRequireRuntimeTrace(false);
        }
        onSaved?.(saved);
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="lab-info-heading">
        <div className="flex items-center gap-2 border-b pb-2">
          <ClipboardList className="size-4 text-primary" aria-hidden="true" />
          <h2 id="lab-info-heading" className="font-semibold">
            {t("Lab information", "Thông tin Lab")}
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
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
            <span className="text-xs font-normal text-muted-foreground">{title.length}/255</span>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t("Due date (optional)", "Hạn nộp (không bắt buộc)")}</span>
            <Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} />
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>{t("Instructions, learning goals and completion criteria", "Hướng dẫn, mục tiêu và tiêu chí hoàn thành")}</span>
          <Textarea
            aria-label="Assignment instructions"
            maxLength={10000}
            rows={6}
            value={instructions}
            placeholder={t(
              "Describe the learning goal, what students should investigate, the required evidence and the completion criteria.",
              "Nêu mục tiêu học tập, nội dung sinh viên cần khảo sát, bằng chứng cần nộp và tiêu chí hoàn thành.",
            )}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="lab-mode-heading">
        <div className="flex items-center gap-2 border-b pb-2">
          <Rocket className="size-4 text-primary" aria-hidden="true" />
          <h2 id="lab-mode-heading" className="font-semibold">
            {t("Lab mode", "Hình thức Lab")}
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            aria-pressed={!requireRuntimeTrace}
            onClick={() => setRequireRuntimeTrace(false)}
            className={`space-y-1 rounded-xl border p-4 text-left transition-colors ${
              !requireRuntimeTrace ? "border-primary bg-primary/5" : "hover:bg-muted/40"
            }`}
          >
            <span className="block text-sm font-semibold">
              {t("Theory + Quiz", "Lý thuyết + Quiz")}
            </span>
            <span className="block text-xs leading-5 text-muted-foreground">
              {t(
                "Lesson, sample repository and C1–C3 reference views plus the Quiz gate. No runtime session.",
                "Bài học, repo mẫu và C1–C3 tham chiếu cùng Quiz gate. Không có phiên runtime.",
              )}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={requireRuntimeTrace}
            onClick={() => setRequireRuntimeTrace(true)}
            className={`space-y-1 rounded-xl border p-4 text-left transition-colors ${
              requireRuntimeTrace ? "border-primary bg-primary/5" : "hover:bg-muted/40"
            }`}
          >
            <span className="block text-sm font-semibold">
              {t("Theory + Quiz + Studio", "Lý thuyết + Quiz + Studio")}
            </span>
            <span className="block text-xs leading-5 text-muted-foreground">
              {t(
                "Adds a real MAVIS Studio Live practice and evidence step after the Quiz.",
                "Thêm bước thực hành MAVIS Studio Live thật và minh chứng sau Quiz.",
              )}
            </span>
          </button>
        </div>
        <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
          {t(
            "Students do not submit diagrams or a model version. C1–C3 are read-only theory content linked to the sample repository.",
            "Sinh viên không nộp diagram hay model version. C1–C3 là nội dung lý thuyết chỉ đọc gắn với repo mẫu.",
          )}
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
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
