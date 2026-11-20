"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ClipboardList } from "lucide-react";
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
  const cache = useQueryClient();
  const save = useApiMutation(assignment ? "updateAssignment" : "createAssignment");
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [instructions, setInstructions] = useState(assignment?.instructions ?? "");
  const [guideTab, setGuideTab] = useState<"write" | "preview">("write");
  const [stayMessage, setStayMessage] = useState("");

  const persist = (advance: boolean) => {
    if (!title.trim()) return;
    setStayMessage("");
    const existingPolicy =
      assignment?.aiPolicy && typeof assignment.aiPolicy === "object"
        ? (assignment.aiPolicy as Record<string, unknown>)
        : {};
    const payload: Record<string, unknown> = {
      workspaceId,
      ...(assignment ? { assignmentId: assignment.id } : {}),
      title: title.trim(),
      description: instructions,
      dueAt: null,
      requireRuntimeTrace: assignment?.requireRuntimeTrace ?? false,
      labMode: assignment?.labMode ?? "THEORY_QUIZ",
      aiPolicy: existingPolicy,
      requiredDiagramTypes: [],
      clearReferenceSource: false,
    };
    const referenceModelId = assignment?.referenceSource?.modelId;
    if (referenceModelId) payload["referenceModelId"] = referenceModelId;
    save.mutate(payload as Parameters<typeof save.mutate>[0], {
      onSuccess: (saved: Assignment) => {
        void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
        if (!assignment) {
          setTitle("");
          setInstructions("");
        }
        if (advance) {
          onSaved?.(saved);
        } else {
          setStayMessage(t("Lab information updated.", "Đã cập nhật thông tin Lab."));
        }
      },
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    persist(true);
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

        <label className="block space-y-1.5 text-sm font-medium">
          <span>{t("Lab title", "Tên Lab")}</span>
          <Input
            aria-label={t("Lab title", "Tên Lab")}
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        {/* Instructions, learning goals and completion criteria */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="lab-instructions-input" className="text-sm font-medium">
              {t("Description (Markdown)", "Mô tả (Markdown)")}
            </label>
            <div role="tablist" className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                role="tab"
                aria-selected={guideTab === "write"}
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
                role="tab"
                aria-selected={guideTab === "preview"}
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
              aria-label={t("Description", "Mô tả")}
              maxLength={10000}
              rows={5}
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value);
                if (stayMessage) setStayMessage("");
              }}
            />
          ) : (
            <div className="min-h-36 rounded-lg border bg-background p-4 text-sm">
              {instructions.trim() ? (
                <MarkdownPreview markdown={instructions} />
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Saving creates a draft Lab (Theory + Quiz + Studio). Students do not submit diagrams. Attach the reference source and publish it in the next steps. t("Next Step 2: Lab Theory", "Sang Bước 2: Lý thuyết Lab") */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {assignment && (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending || !title.trim()}
            onClick={() => persist(false)}
          >
            {save.isPending ? t("Saving…", "Đang lưu…") : t("Save changes", "Lưu thay đổi")}
          </Button>
        )}
        <Button type="submit" disabled={save.isPending || !title.trim()}>
          {save.isPending
            ? t("Saving Lab draft…", "Đang lưu bản nháp Lab…")
            : t("Next Step 2: Reference Source", "Sang Bước 2: Nguồn tham chiếu")}
          <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
        </Button>
      </div>
      {save.error && <ErrorState error={save.error} />}
      {(stayMessage || save.isSuccess) && (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <Check className="size-4" aria-hidden="true" />
          {stayMessage || t("Lab draft saved.", "Đã lưu bản nháp Lab.")}
        </p>
      )}
    </form>
  );
}
