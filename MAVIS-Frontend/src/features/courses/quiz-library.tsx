"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuizBuilder } from "@/features/assignments/quiz-builder";
import { emptyQuestion, type QuizDraft, type QuizQuestion } from "@/features/assignments/quiz-types";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";
import { CourseSetupFlowFrame } from "./course-setup-flow-navigation";

type QuizAsset = {
  id: string;
  title: string;
  description: string | null;
  passPercent: number;
  questions: QuizQuestion[];
  updatedAt: string;
};

const NEW_ASSET: QuizAsset = {
  id: "new", title: "", description: "", passPercent: 80,
  questions: [emptyQuestion()], updatedAt: "",
};

export function QuizLibrary({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const course = useCourseAuthoring(workspaceId);
  const [editing, setEditing] = useState<QuizAsset | null>(null);
  const [moduleByAsset, setModuleByAsset] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const assets = useQuery({
    queryKey: ["api", "quiz-assets", workspaceId],
    queryFn: ({ signal }) => api<QuizAsset[]>(`workspaces/${workspaceId}/quiz-assets`, { signal }),
  });
  const assignedIds = useMemo(
    () => new Set(course.data?.modules.flatMap((module) => module.items)
      .map((item) => String(item.content["quizAssetId"] ?? "")).filter(Boolean) ?? []),
    [course.data],
  );
  const invalidate = async () => cache.invalidateQueries({ queryKey: ["api", "quiz-assets", workspaceId] });
  const remove = useMutation({
    mutationFn: (id: string) => api<null>(`workspaces/${workspaceId}/quiz-assets/${id}`, { method: "DELETE" }),
    onSuccess: () => void invalidate(),
  });
  const saveAsset = async (draft: QuizDraft) => {
    const path = editing && editing.id !== "new"
      ? `workspaces/${workspaceId}/quiz-assets/${editing.id}`
      : `workspaces/${workspaceId}/quiz-assets`;
    const saved = await api<QuizAsset>(path, {
      method: editing && editing.id !== "new" ? "PUT" : "POST",
      body: JSON.stringify({
        title: draft.lesson,
        description: editing?.description ?? "",
        passPercent: draft.passPercent,
        questions: draft.questions,
      }),
    });
    await invalidate();
    setError("");
    return saved;
  };
  const assign = (asset: QuizAsset) => {
    const moduleId = moduleByAsset[asset.id] || course.data?.modules[0]?.id;
    if (!moduleId) {
      setError(t("Create a Module before assigning this Quiz.", "Hãy tạo Module trước khi xếp Quiz."));
      return;
    }
    course.addItem.mutate({
      moduleId, type: "QUIZ", title: asset.title,
      ...(asset.description ? { description: asset.description } : {}),
      required: true,
      content: { quizAssetId: asset.id, passPercent: asset.passPercent, questions: asset.questions },
    }, { onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)) });
  };

  const content = <section className="space-y-5" aria-labelledby="quiz-library-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="quiz-library-title" className="text-2xl font-bold">{t("Quiz Library", "Thư viện Quiz")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("Prepare a Quiz, then assign it to a Module when ready.", "Chuẩn bị Quiz, sau đó xếp vào Module khi đã sẵn sàng.")}</p>
      </div>
      <Button onClick={() => setEditing({ ...NEW_ASSET, questions: [emptyQuestion()] })}>
        <Plus className="mr-1.5 size-4" />{t("New Quiz", "Quiz mới")}
      </Button>
    </div>

    {editing && <QuizBuilder key={editing.id} workspaceId={workspaceId} asset={editing} onSaveAsset={saveAsset} onCancel={() => setEditing(null)} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid gap-3">
      {(assets.data ?? []).map((asset) => <article key={asset.id} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileQuestion className="size-5" /></span>
        <div className="min-w-48 flex-1"><h3 className="font-bold">{asset.title}</h3><p className="text-sm text-muted-foreground">{asset.questions.length} {t("questions", "câu hỏi")} · {asset.passPercent}% · {assignedIds.has(asset.id) ? t("Assigned", "Đã xếp") : t("Ready", "Sẵn sàng")}</p></div>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={moduleByAsset[asset.id] ?? ""} onChange={(event) => setModuleByAsset({ ...moduleByAsset, [asset.id]: event.target.value })}>
          <option value="">{t("Choose Module", "Chọn Module")}</option>
          {course.data?.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => assign(asset)}>{t("Add to Module", "Thêm vào Module")}</Button>
        <Button size="icon" variant="ghost" aria-label={t("Edit Quiz", "Sửa Quiz")} onClick={() => setEditing(asset)}><Pencil className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={t("Delete Quiz", "Xóa Quiz")} onClick={() => remove.mutate(asset.id)}><Trash2 className="size-4" /></Button>
      </article>)}
      {!assets.isLoading && !assets.data?.length && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("No Quiz drafts yet.", "Chưa có bản nháp Quiz.")}</p>}
    </div>
  </section>;

  return <CourseSetupFlowFrame workspaceId={workspaceId} currentStep="quiz">{content}</CourseSetupFlowFrame>;
}
