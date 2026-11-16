"use client";

import { useState } from "react";
import { Check, ClipboardList, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import { useApiMutation } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { DIAGRAM_REQUIREMENTS, type Assignment } from "./requirements";
import { normalizeDiagramRequirements } from "@/lib/architecture/coursework-diagram-types";

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
  const [requiredDiagramTypes, setRequiredDiagramTypes] = useState<string[]>(
    normalizeDiagramRequirements(assignment?.requiredDiagramTypes ?? []),
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
      requiredDiagramTypes,
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
          setRequiredDiagramTypes([]);
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

      <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="lab-requirements-heading">
        <div className="flex items-center gap-2 border-b pb-2">
          <Rocket className="size-4 text-primary" aria-hidden="true" />
          <h2 id="lab-requirements-heading" className="font-semibold">
            {t("Student evidence requirements", "Yêu cầu minh chứng của sinh viên")}
          </h2>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40">
          <input
            className="mt-1 size-4 accent-primary"
            type="checkbox"
            checked={requireRuntimeTrace}
            onChange={(event) => setRequireRuntimeTrace(event.target.checked)}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">
              {t("Require a real runtime trace", "Yêu cầu trace runtime thật")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                "Students must complete the Runtime/Studio evidence flow before submitting this Lab.",
                "Sinh viên phải hoàn tất luồng minh chứng Runtime/Studio trước khi nộp Lab.",
              )}
            </span>
          </span>
        </label>
        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">
            {t("Required architecture views", "Các góc nhìn kiến trúc bắt buộc")}
          </legend>
          <p className="text-xs text-muted-foreground">
            {t(
              "Select the diagrams students must include. Leave all unchecked if any saved view is acceptable.",
              "Chọn sơ đồ sinh viên cần nộp. Để trống nếu chấp nhận bất kỳ góc nhìn nào đã lưu.",
            )}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DIAGRAM_REQUIREMENTS.map((type) => (
              <label
                key={type.id}
                className="flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <input
                  className="size-4 accent-primary"
                  type="checkbox"
                  checked={requiredDiagramTypes.includes(type.id)}
                  onChange={(event) =>
                    setRequiredDiagramTypes((current) =>
                      event.target.checked
                        ? [...current, type.id]
                        : current.filter((value) => value !== type.id),
                    )
                  }
                />
                {type.label}
              </label>
            ))}
          </div>
        </fieldset>
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
