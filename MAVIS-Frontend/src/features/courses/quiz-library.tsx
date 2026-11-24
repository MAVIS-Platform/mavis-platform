"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";
import { CourseSetupFlowFrame } from "./course-setup-flow-navigation";

type Question = {
  id?: string;
  prompt: string;
  type: "SINGLE_CHOICE";
  options: string[];
  correctOption: number;
  explanation?: string;
  points: number;
};

type QuizAsset = {
  id: string;
  title: string;
  description: string | null;
  passPercent: number;
  questions: Question[];
  updatedAt: string;
};

type Draft = Omit<QuizAsset, "id" | "updatedAt">;
const blankQuestion = (): Question => ({
  prompt: "",
  type: "SINGLE_CHOICE",
  options: ["", ""],
  correctOption: 0,
  points: 1,
});
const EMPTY: Draft = { title: "", description: "", passPercent: 70, questions: [blankQuestion()] };

export function QuizLibrary({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const course = useCourseAuthoring(workspaceId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
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
  const invalidate = () => void cache.invalidateQueries({ queryKey: ["api", "quiz-assets", workspaceId] });
  const save = useMutation({
    mutationFn: () => api<QuizAsset>(
      editingId && editingId !== "new"
        ? `workspaces/${workspaceId}/quiz-assets/${editingId}`
        : `workspaces/${workspaceId}/quiz-assets`,
      { method: editingId && editingId !== "new" ? "PUT" : "POST", body: JSON.stringify(draft) },
    ),
    onSuccess: () => { invalidate(); setEditingId(null); setDraft(EMPTY); setError(""); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<null>(`workspaces/${workspaceId}/quiz-assets/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const assign = (asset: QuizAsset) => {
    const moduleId = moduleByAsset[asset.id] || course.data?.modules[0]?.id;
    if (!moduleId) { setError(t("Create a Module before assigning this Quiz.", "Hãy tạo Module trước khi xếp Quiz.")); return; }
    course.addItem.mutate({
      moduleId,
      type: "QUIZ",
      title: asset.title,
      ...(asset.description ? { description: asset.description } : {}),
      required: true,
      content: { quizAssetId: asset.id, passPercent: asset.passPercent, questions: asset.questions },
    }, { onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)) });
  };
  const updateQuestion = (index: number, next: Question) => setDraft({
    ...draft,
    questions: draft.questions.map((question, current) => current === index ? next : question),
  });

  const content = <section className="space-y-5" aria-labelledby="quiz-library-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="quiz-library-title" className="text-2xl font-bold">{t("Quiz Library", "Thư viện Quiz")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("Prepare a Quiz, then assign it to a Module when ready.", "Chuẩn bị Quiz, sau đó xếp vào Module khi đã sẵn sàng.")}</p>
      </div>
      <Button onClick={() => { setEditingId("new"); setDraft(EMPTY); }}><Plus className="mr-1.5 size-4" />{t("New Quiz", "Quiz mới")}</Button>
    </div>

    {editingId && <div className="space-y-4 rounded-2xl border bg-card p-5">
      <Input value={draft.title} maxLength={255} placeholder={t("Quiz title", "Tiêu đề Quiz")} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <Textarea value={draft.description ?? ""} placeholder={t("Description (optional)", "Mô tả (không bắt buộc)")} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      <label className="block max-w-48 space-y-1 text-sm"><span>{t("Pass percentage", "Điểm đạt (%)")}</span><Input type="number" min={1} max={100} value={draft.passPercent} onChange={(event) => setDraft({ ...draft, passPercent: Number(event.target.value) })} /></label>
      {draft.questions.map((question, index) => <div key={index} className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between"><strong>{t(`Question ${index + 1}`, `Câu ${index + 1}`)}</strong>{draft.questions.length > 1 && <Button size="icon" variant="ghost" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, current) => current !== index) })}><Trash2 className="size-4" /></Button>}</div>
        <Input value={question.prompt} placeholder={t("Question prompt", "Nội dung câu hỏi")} onChange={(event) => updateQuestion(index, { ...question, prompt: event.target.value })} />
        {question.options.map((option, optionIndex) => <label key={optionIndex} className="flex items-center gap-2"><input type="radio" name={`correct-${index}`} checked={question.correctOption === optionIndex} onChange={() => updateQuestion(index, { ...question, correctOption: optionIndex })} /><Input value={option} placeholder={t(`Option ${optionIndex + 1}`, `Lựa chọn ${optionIndex + 1}`)} onChange={(event) => updateQuestion(index, { ...question, options: question.options.map((value, current) => current === optionIndex ? event.target.value : value) })} /></label>)}
        <Button size="sm" variant="outline" onClick={() => updateQuestion(index, { ...question, options: [...question.options, ""] })}><Plus className="mr-1 size-3" />{t("Option", "Lựa chọn")}</Button>
      </div>)}
      <Button variant="outline" onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}><Plus className="mr-1.5 size-4" />{t("Question", "Câu hỏi")}</Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditingId(null)}>{t("Cancel", "Hủy")}</Button><Button disabled={save.isPending} onClick={() => save.mutate()}>{t("Save draft", "Lưu bản nháp")}</Button></div>
    </div>}

    <div className="grid gap-3">
      {(assets.data ?? []).map((asset) => <article key={asset.id} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileQuestion className="size-5" /></span>
        <div className="min-w-48 flex-1"><h3 className="font-bold">{asset.title}</h3><p className="text-sm text-muted-foreground">{asset.questions.length} {t("questions", "câu hỏi")} · {asset.passPercent}% · {assignedIds.has(asset.id) ? t("Assigned", "Đã xếp") : t("Ready", "Sẵn sàng")}</p></div>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={moduleByAsset[asset.id] ?? ""} onChange={(event) => setModuleByAsset({ ...moduleByAsset, [asset.id]: event.target.value })}><option value="">{t("Choose Module", "Chọn Module")}</option>{course.data?.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select>
        <Button size="sm" variant="outline" onClick={() => assign(asset)}>{t("Add to Module", "Thêm vào Module")}</Button>
        <Button size="icon" variant="ghost" onClick={() => { setEditingId(asset.id); setDraft({ title: asset.title, description: asset.description, passPercent: asset.passPercent, questions: asset.questions }); }}><Pencil className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => remove.mutate(asset.id)}><Trash2 className="size-4" /></Button>
      </article>)}
      {!assets.isLoading && !assets.data?.length && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("No Quiz drafts yet.", "Chưa có bản nháp Quiz.")}</p>}
    </div>
  </section>;

  return (
    <CourseSetupFlowFrame workspaceId={workspaceId} currentStep="quiz">
      {content}
    </CourseSetupFlowFrame>
  );
}
