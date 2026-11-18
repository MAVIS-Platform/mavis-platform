"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Check, CircleHelp, ClipboardList, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { useApiMutation } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { resolveLabTier, type Assignment, type LabTier } from "./requirements";

const LAB_TIERS: Array<{
  id: LabTier;
  en: string;
  vi: string;
  descEn: string;
  descVi: string;
  icon: typeof BookOpen;
}> = [
  {
    id: "THEORY_ONLY",
    en: "Theory Only (C1–C3 & Lesson)",
    vi: "Lab chỉ Lý thuyết (C1–C3 & Bài giảng)",
    descEn: "Students read the lesson, inspect C1–C3 diagrams & Reverse BFS Impact without Quiz or Studio.",
    descVi: "Chỉ gồm Lý thuyết Markdown + Sơ đồ C1–C3 & Reverse BFS (không có Quiz, không có Studio).",
    icon: BookOpen,
  },
  {
    id: "THEORY_QUIZ",
    en: "Theory + Quiz",
    vi: "Lab Lý thuyết + Quiz",
    descEn: "Students study Theory & C1–C3 diagrams and pass the Quiz Gate (no Studio Live session).",
    descVi: "Có Lý thuyết + C1–C3 và bài trắc nghiệm Quiz Gate (chưa có thực hành Studio Live).",
    icon: CircleHelp,
  },
  {
    id: "THEORY_QUIZ_STUDIO",
    en: "Theory + Quiz + Studio",
    vi: "Lab Lý thuyết + Quiz + Studio",
    descEn: "Full guided Lab: Theory, C1–C3 diagrams, Quiz Gate, and interactive 2D Studio Live exercise.",
    descVi: "Đầy đủ Lý thuyết, C1–C3, Quiz Gate và bài thực hành mô phỏng 2D Studio Live.",
    icon: Play,
  },
];

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
  const [labTier, setLabTier] = useState<LabTier>(() =>
    assignment ? resolveLabTier(assignment) : "THEORY_QUIZ_STUDIO",
  );
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
  const [guideTab, setGuideTab] = useState<"write" | "preview">("write");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const isStudio = labTier === "THEORY_QUIZ_STUDIO";
    const isTheoryOnly = labTier === "THEORY_ONLY";
    const existingPolicy =
      assignment?.aiPolicy && typeof assignment.aiPolicy === "object"
        ? (assignment.aiPolicy as Record<string, unknown>)
        : {};
    const payload: Record<string, unknown> = {
      workspaceId,
      ...(assignment ? { assignmentId: assignment.id } : {}),
      title: title.trim(),
      description: instructions,
      dueAt: due ? new Date(due).toISOString() : null,
      requireRuntimeTrace: isStudio,
      labMode: isStudio ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ",
      aiPolicy: {
        ...existingPolicy,
        labTier,
        skipQuiz: isTheoryOnly,
      },
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

        <fieldset className="space-y-2.5">
          <legend className="text-sm font-medium">
            {t(
              "Lab structure & required steps (choose Lab type)",
              "Cấp độ bài Lab (chọn cấu trúc các bước trong Lab này)",
            )}
          </legend>
          <div className="grid gap-3 md:grid-cols-3">
            {LAB_TIERS.map((tier) => {
              const Icon = tier.icon;
              const selected = labTier === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setLabTier(tier.id)}
                  className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition ${
                    selected
                      ? "border-teal-500 bg-teal-50/70 ring-1 ring-teal-500 dark:border-teal-600 dark:bg-teal-950/30"
                      : "bg-background hover:border-teal-300"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Icon className="size-4 text-teal-600" aria-hidden="true" />
                      {t(tier.en, tier.vi)}
                    </span>
                    {selected && (
                      <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {t("Selected", "Đang chọn")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t(tier.descEn, tier.descVi)}
                  </p>
                </button>
              );
            })}
          </div>
        </fieldset>

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
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t(
            "Saving creates a draft Lab (Theory + Quiz + Studio). Students do not submit diagrams. Attach the reference source and publish it in the next steps.",
            "Lưu sẽ tạo Lab nháp (Lý thuyết + Quiz + Studio). Sinh viên không nộp diagram. Gắn nguồn tham chiếu và công bố ở các bước tiếp theo.",
          )}
        </p>
        <Button disabled={save.isPending || !title.trim()}>
          {save.isPending
            ? t("Saving Lab draft…", "Đang lưu bản nháp Lab…")
            : t("Next Step 2: Lab Theory", "Sang Bước 2: Lý thuyết Lab")}
          <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
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
