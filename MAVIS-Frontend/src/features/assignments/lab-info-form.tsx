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
import { resolveLabTier, type Assignment } from "./requirements";

function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso || iso === "No deadline") return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

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
  const [dueLocal, setDueLocal] = useState(() => toDateTimeLocalValue(assignment?.dueAt));
  const [guideTab, setGuideTab] = useState<"write" | "preview">("write");
  const [stayMessage, setStayMessage] = useState("");

  const persist = (advance: boolean) => {
    if (!title.trim()) return;
    setStayMessage("");
    const existingPolicy =
      assignment?.aiPolicy && typeof assignment.aiPolicy === "object"
        ? (assignment.aiPolicy as Record<string, unknown>)
        : {};
    const parsedDue = dueLocal ? new Date(dueLocal) : null;
    const dueAtIso =
      parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue.toISOString() : null;
    // Preserve any existing tier/runtime setting; new Labs stay flexible and auto-detect from Steps 2–5.
    const preservedTier = assignment ? resolveLabTier(assignment) : "THEORY_QUIZ";
    const persistedLabMode = preservedTier === "THEORY_ONLY" ? "THEORY_QUIZ" : preservedTier;
    const payload: Record<string, unknown> = {
      workspaceId,
      ...(assignment ? { assignmentId: assignment.id } : {}),
      title: title.trim(),
      description: instructions,
      dueAt: dueAtIso,
      requireRuntimeTrace: preservedTier === "THEORY_QUIZ_STUDIO",
      labMode: persistedLabMode,
      aiPolicy: {
        ...existingPolicy,
        labTier: preservedTier,
        skipQuiz: preservedTier === "THEORY_ONLY",
      },
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
      <section
        className="space-y-5 rounded-2xl border border-slate-300 bg-card p-6 shadow-sm dark:border-border"
        aria-labelledby="lab-info-heading"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3.5 dark:border-border">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="size-4" aria-hidden="true" />
            </span>
            <h2 id="lab-info-heading" className="text-lg font-bold text-foreground">
              {t("Lab information", "Thông tin Lab")}
            </h2>
          </div>
          <span className="text-xs font-semibold text-foreground/65 tabular-nums">
            {title.length}/255
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <label className="block space-y-1.5 text-sm font-semibold text-foreground">
            <span>{t("Lab title", "Tên Lab")}</span>
            <Input
              aria-label={t("Lab title", "Tên Lab")}
              required
              maxLength={255}
              className="h-10 border-slate-300 bg-card text-foreground dark:border-border"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-semibold text-foreground">
            <span>{t("Due date (optional)", "Hạn nộp (tùy chọn)")}</span>
            <Input
              type="datetime-local"
              aria-label={t("Due date", "Hạn nộp")}
              className="h-10 border-slate-300 bg-card text-foreground dark:border-border"
              value={dueLocal}
              onChange={(event) => {
                setDueLocal(event.target.value);
                if (stayMessage) setStayMessage("");
              }}
            />
          </label>
        </div>

        {/* Instructions, learning goals and completion criteria */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="lab-instructions-input" className="text-sm font-semibold text-foreground">
              {t("Description (Markdown)", "Mô tả (Markdown)")}
            </label>
            <div
              role="tablist"
              className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs dark:border-border dark:bg-muted/50"
            >
              <button
                type="button"
                role="tab"
                aria-selected={guideTab === "write"}
                onClick={() => setGuideTab("write")}
                className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                  guideTab === "write"
                    ? "bg-card text-primary shadow-xs"
                    : "text-foreground/75 hover:text-foreground"
                }`}
              >
                {t("Write", "Soạn thảo")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={guideTab === "preview"}
                onClick={() => setGuideTab("preview")}
                className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                  guideTab === "preview"
                    ? "bg-card text-primary shadow-xs"
                    : "text-foreground/75 hover:text-foreground"
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
              className="border-slate-300 bg-card text-foreground dark:border-border"
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value);
                if (stayMessage) setStayMessage("");
              }}
            />
          ) : (
            <div className="min-h-36 rounded-lg border border-slate-300 bg-card p-4 text-sm dark:border-border">
              {instructions.trim() ? (
                <MarkdownPreview markdown={instructions} />
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Saving creates a draft Lab. Studio Live is configured next. */}
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
            : t("Next Step 2: Studio Live", "Sang Bước 2: Studio Live")}
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
