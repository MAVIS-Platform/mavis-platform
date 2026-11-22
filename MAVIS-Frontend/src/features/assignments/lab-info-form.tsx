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
  const [labMode, setLabMode] = useState<"THEORY_ONLY" | "THEORY_QUIZ" | "THEORY_QUIZ_STUDIO">(
    assignment ? resolveLabTier(assignment) : "THEORY_QUIZ",
  );
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
    // DB lab_mode CHECK constraint allows LEGACY|THEORY_QUIZ|THEORY_QUIZ_STUDIO; THEORY_ONLY lives in aiPolicy.labTier.
    const persistedLabMode = labMode === "THEORY_ONLY" ? "THEORY_QUIZ" : labMode;
    const payload: Record<string, unknown> = {
      workspaceId,
      ...(assignment ? { assignmentId: assignment.id } : {}),
      title: title.trim(),
      description: instructions,
      dueAt: dueAtIso,
      requireRuntimeTrace: labMode === "THEORY_QUIZ_STUDIO",
      labMode: persistedLabMode,
      aiPolicy: {
        ...existingPolicy,
        labTier: labMode,
        skipQuiz: labMode === "THEORY_ONLY",
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

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-semibold text-foreground">
            <span>{t("Lab mode", "Chế độ Lab")}</span>
            <select
              aria-label={t("Lab mode", "Chế độ Lab")}
              className="h-10 w-full rounded-md border border-slate-300 bg-card px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-border"
              value={labMode}
              onChange={(event) => {
                setLabMode(
                  event.target.value as "THEORY_ONLY" | "THEORY_QUIZ" | "THEORY_QUIZ_STUDIO",
                );
                if (stayMessage) setStayMessage("");
              }}
            >
              <option value="THEORY_ONLY">
                {t("Theory Only (no Quiz, no Studio)", "Chỉ Lý thuyết (không Quiz, không Studio)")}
              </option>
              <option value="THEORY_QUIZ">
                {t("Theory + Quiz (Static / C1–C3)", "Lý thuyết + Quiz (Tĩnh / C1–C3)")}
              </option>
              <option value="THEORY_QUIZ_STUDIO">
                {t("Theory + Quiz + Studio Live (Docker)", "Lý thuyết + Quiz + Studio Live (Docker)")}
              </option>
            </select>
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
            : labMode === "THEORY_ONLY"
              ? t("Next Step 3: Lab Theory", "Sang Bước 3: Lý thuyết Lab")
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
