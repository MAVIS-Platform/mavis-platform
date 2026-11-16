"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Code2,
  FileText,
  GitFork,
  HelpCircle,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";

const itemTypes = ["THEORY", "QUIZ", "ESSAY", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const;
type ItemType = (typeof itemTypes)[number];

const TYPE_META: Record<ItemType, { en: string; vi: string; icon: LucideIcon }> = {
  THEORY: { en: "Theory", vi: "Lý thuyết", icon: BookOpen },
  QUIZ: { en: "Quiz", vi: "Quiz", icon: HelpCircle },
  ESSAY: { en: "Essay", vi: "Tự luận", icon: FileText },
  STATIC_LAB: { en: "Static Lab", vi: "Lab tĩnh", icon: Code2 },
  IMPACT_LAB: { en: "Impact Lab", vi: "Lab tác động", icon: GitFork },
  RUNTIME_LAB: { en: "Runtime Lab", vi: "Lab runtime", icon: Play },
};

type Item = {
  id: string;
  type: ItemType;
  title: string;
  description: string | null;
  position: number;
  assignmentId: string | null;
  content: Record<string, unknown>;
  required: boolean;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  prerequisiteModuleId: string | null;
  items: Item[];
};

type ItemDraft = {
  type: ItemType;
  title: string;
  description: string;
  body: string;
  prompt: string;
  rubric: string;
  assignmentId: string;
  required: boolean;
};

const emptyDraft = (): ItemDraft => ({
  type: "THEORY",
  title: "",
  description: "",
  body: "",
  prompt: "",
  rubric: "",
  assignmentId: "",
  required: true,
});

function parseRubric(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [criterion, score] = line.split("|").map((part) => part.trim());
      const parsed = score === undefined || score === "" ? 10 : Number(score);
      return { criterion: criterion || "Criterion", maxScore: Number.isFinite(parsed) ? parsed : 10 };
    });
}

function rubricText(rubric: unknown) {
  if (!Array.isArray(rubric)) return "";
  return rubric
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const record = entry as Record<string, unknown>;
      return `${String(record["criterion"] ?? "")}|${String(record["maxScore"] ?? 10)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function contentFromDraft(draft: ItemDraft): Record<string, unknown> {
  if (draft.type === "THEORY") return { body: draft.body.trim() };
  if (draft.type === "ESSAY") return { prompt: draft.prompt.trim(), rubric: parseRubric(draft.rubric) };
  return {};
}

function draftFromItem(item: Item): ItemDraft {
  const content = item.content ?? {};
  return {
    type: item.type,
    title: item.title,
    description: item.description ?? "",
    body: typeof content["body"] === "string" ? content["body"] : "",
    prompt: typeof content["prompt"] === "string" ? content["prompt"] : "",
    rubric: rubricText(content["rubric"]),
    assignmentId: item.assignmentId ?? "",
    required: item.required,
  };
}

function draftValid(draft: ItemDraft) {
  if (!draft.title.trim()) return false;
  if (draft.type === "THEORY" && !draft.body.trim()) return false;
  if (draft.type === "ESSAY" && !draft.prompt.trim()) return false;
  if (["QUIZ", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(draft.type) && !draft.assignmentId) {
    return false;
  }
  return true;
}

function ItemFields({
  draft,
  onChange,
  assignments,
  t,
}: {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  assignments: Array<{ id: string; title: string; requireRuntimeTrace?: boolean }>;
  t: (en: string, vi: string) => string;
}) {
  const labs = draft.type === "RUNTIME_LAB"
    ? assignments.filter((assignment) => assignment.requireRuntimeTrace)
    : assignments;
  const needsAssignment = ["QUIZ", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(draft.type);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Item type", "Loại nội dung")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.type}
            onChange={(event) => onChange({ type: event.target.value as ItemType })}
          >
            {itemTypes.map((type) => (
              <option key={type} value={type}>
                {t(TYPE_META[type].en, TYPE_META[type].vi)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Item title", "Tên nội dung")}</span>
          <Input
            required
            maxLength={255}
            value={draft.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
      </div>
      <label className="space-y-1 text-xs font-medium">
        <span>{t("Short description", "Mô tả ngắn")}</span>
        <Input
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </label>
      {needsAssignment && (
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Linked Lab", "Lab liên kết")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.assignmentId}
            onChange={(event) => onChange({ assignmentId: event.target.value })}
          >
            <option value="">{t("Choose a published Lab", "Chọn Lab đã công bố")}</option>
            {labs.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft.type === "THEORY" && (
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Theory content", "Nội dung lý thuyết")}</span>
          <Textarea
            rows={5}
            value={draft.body}
            placeholder={t(
              "Write the lesson students read before the Quiz.",
              "Viết bài học sinh viên đọc trước khi làm Quiz.",
            )}
            onChange={(event) => onChange({ body: event.target.value })}
          />
        </label>
      )}
      {draft.type === "ESSAY" && (
        <>
          <label className="space-y-1 text-xs font-medium">
            <span>{t("Essay prompt", "Đề tự luận")}</span>
            <Textarea
              rows={3}
              value={draft.prompt}
              onChange={(event) => onChange({ prompt: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t("Rubric (one per line: criterion | max score)", "Rubric (mỗi dòng: tiêu chí | điểm tối đa)")}</span>
            <Textarea
              rows={3}
              value={draft.rubric}
              placeholder={"Reasoning | 10"}
              onChange={(event) => onChange({ rubric: event.target.value })}
            />
          </label>
        </>
      )}
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={draft.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        {t("Required activity", "Hoạt động bắt buộc")}
      </label>
    </div>
  );
}

export function CourseBuilder({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const course = useCourseAuthoring(workspaceId);
  const assignments = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [modulePrerequisite, setModulePrerequisite] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [editModuleDescription, setEditModuleDescription] = useState("");
  const [editModulePrerequisite, setEditModulePrerequisite] = useState("");
  const [editingItem, setEditingItem] = useState<{ moduleId: string; itemId: string; draft: ItemDraft } | null>(null);

  useEffect(() => {
    setTitle(course.data?.title ?? "");
    setDescription(course.data?.description ?? "");
  }, [course.data?.id, course.data?.title, course.data?.description]);

  if (course.isPending) {
    return <p className="text-sm text-muted-foreground">{t("Loading course builder…", "Đang tải trình tạo khóa học…")}</p>;
  }

  const data = course.data;
  const modules = (data?.modules as Module[] | undefined) ?? [];
  const assignmentRows = (assignments.data ?? []) as Array<{ id: string; title: string; requireRuntimeTrace?: boolean }>;
  const busy =
    course.save.isPending ||
    course.addModule.isPending ||
    course.updateModule.isPending ||
    course.moveModule.isPending ||
    course.addItem.isPending ||
    course.updateItem.isPending ||
    course.moveItem.isPending ||
    course.deleteItem.isPending;

  const draftFor = (moduleId: string) => drafts[moduleId] ?? emptyDraft();
  const updateDraft = (moduleId: string, patch: Partial<ItemDraft>) =>
    setDrafts((current) => ({ ...current, [moduleId]: { ...(current[moduleId] ?? emptyDraft()), ...patch } }));

  const saveCourse = (event: React.FormEvent) => {
    event.preventDefault();
    course.save.mutate({ title, description });
  };

  const addModule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!moduleTitle.trim()) return;
    const body: { title: string; description?: string; prerequisiteModuleId?: string } = {
      title: moduleTitle.trim(),
    };
    if (moduleDescription.trim()) body.description = moduleDescription.trim();
    if (modulePrerequisite) body.prerequisiteModuleId = modulePrerequisite;
    course.addModule.mutate(body, {
      onSuccess: () => {
        setModuleTitle("");
        setModuleDescription("");
        setModulePrerequisite("");
      },
    });
  };

  const startEditModule = (module: Module) => {
    setEditingModule(module);
    setEditModuleTitle(module.title);
    setEditModuleDescription(module.description ?? "");
    setEditModulePrerequisite(module.prerequisiteModuleId ?? "");
  };

  const saveModule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingModule || !editModuleTitle.trim()) return;
    const body: {
      moduleId: string;
      title: string;
      description?: string;
      prerequisiteModuleId?: string;
    } = { moduleId: editingModule.id, title: editModuleTitle.trim() };
    if (editModuleDescription.trim()) body.description = editModuleDescription.trim();
    if (editModulePrerequisite) body.prerequisiteModuleId = editModulePrerequisite;
    course.updateModule.mutate(body, { onSuccess: () => setEditingModule(null) });
  };

  const addItem = (moduleId: string, event: React.FormEvent) => {
    event.preventDefault();
    const draft = draftFor(moduleId);
    if (!draftValid(draft)) return;
    const body: {
      moduleId: string;
      type: ItemType;
      title: string;
      description?: string;
      required: boolean;
      content: Record<string, unknown>;
      assignmentId?: string;
    } = {
      moduleId,
      type: draft.type,
      title: draft.title.trim(),
      required: draft.required,
      content: contentFromDraft(draft),
    };
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.assignmentId) body.assignmentId = draft.assignmentId;
    course.addItem.mutate(body, { onSuccess: () => setDrafts((current) => ({ ...current, [moduleId]: emptyDraft() })) });
  };

  const saveItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem || !draftValid(editingItem.draft)) return;
    const draft = editingItem.draft;
    const body: {
      moduleId: string;
      itemId: string;
      type: ItemType;
      title: string;
      description?: string;
      required: boolean;
      content: Record<string, unknown>;
      assignmentId?: string;
    } = {
      moduleId: editingItem.moduleId,
      itemId: editingItem.itemId,
      type: draft.type,
      title: draft.title.trim(),
      required: draft.required,
      content: contentFromDraft(draft),
    };
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.assignmentId) body.assignmentId = draft.assignmentId;
    course.updateItem.mutate(body, { onSuccess: () => setEditingItem(null) });
  };

  return (
    <section id="course-builder" aria-labelledby="course-builder-title" className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="course-builder-title" className="flex items-center gap-2 font-semibold">
            <BookOpen className="size-4" aria-hidden="true" />
            {t("Course builder", "Trình tạo khóa học")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Organize theory, quizzes, essays and Labs into modules. Published versions are immutable.",
              "Tổ chức lý thuyết, Quiz, tự luận và Lab thành chương. Phiên bản đã công bố là bất biến.",
            )}
          </p>
        </div>
        {data && (
          <Badge variant={data.status === "PUBLISHED" ? "success" : "secondary"}>
            {data.status} · r{data.draftRevision} · v{data.publishedVersion}
          </Badge>
        )}
      </div>

      <form onSubmit={saveCourse} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
        <Input
          aria-label={t("Course title", "Tên khóa học")}
          required
          maxLength={255}
          placeholder={t("Course title", "Tên khóa học")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Input
          aria-label={t("Course description", "Mô tả khóa học")}
          placeholder={t("Description", "Mô tả")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button disabled={busy}>
          <Save className="mr-1 size-4" aria-hidden="true" />
          {t("Save draft", "Lưu bản nháp")}
        </Button>
      </form>
      {course.save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("Could not save the course draft.", "Không lưu được bản nháp khóa học.")}
        </p>
      )}
      {course.startDraft.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("Could not create a new draft.", "Không tạo được bản nháp mới.")}
        </p>
      )}

      {!data && (
        <p className="text-sm text-muted-foreground">
          {t("Save the course details to start its roadmap.", "Lưu thông tin khóa học để bắt đầu tạo lộ trình.")}
        </p>
      )}

      {data && data.status === "PUBLISHED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm">
            {t(
              "Published versions are immutable. Start a separate draft to continue editing.",
              "Phiên bản đã publish là bất biến. Tạo bản nháp riêng để tiếp tục chỉnh sửa.",
            )}
          </p>
          <Button type="button" variant="outline" disabled={course.startDraft.isPending} onClick={() => course.startDraft.mutate()}>
            {t("Start new draft", "Tạo bản nháp mới")}
          </Button>
        </div>
      )}

      {data && data.status === "DRAFT" && (
        <>
          <form onSubmit={addModule} className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1fr_1.4fr_1fr_auto]">
            <Input
              aria-label={t("Module title", "Tên chương")}
              required
              maxLength={255}
              placeholder={t("New module", "Chương mới")}
              value={moduleTitle}
              onChange={(event) => setModuleTitle(event.target.value)}
            />
            <Input
              aria-label={t("Module description", "Mô tả chương")}
              placeholder={t("Optional description", "Mô tả không bắt buộc")}
              value={moduleDescription}
              onChange={(event) => setModuleDescription(event.target.value)}
            />
            <select
              aria-label={t("Prerequisite module", "Chương tiên quyết")}
              className="rounded-md border bg-background px-3 text-sm"
              value={modulePrerequisite}
              onChange={(event) => setModulePrerequisite(event.target.value)}
            >
              <option value="">{t("No module prerequisite", "Không có chương tiên quyết")}</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.position}. {module.title}
                </option>
              ))}
            </select>
            <Button variant="outline" disabled={busy}>
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {t("Add module", "Thêm chương")}
            </Button>
          </form>
          {course.addModule.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("Could not add the module.", "Không thêm được chương.")}
            </p>
          )}

          <ol className="space-y-3">
            {modules.map((module) => {
              const draft = draftFor(module.id);
              return (
                <li key={module.id} className="rounded-xl border">
                  <details open className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold">
                        {module.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{module.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {module.items.length} {t("activities", "hoạt động")}
                          {module.prerequisiteModuleId
                            ? ` · ${t("Prerequisite", "Tiên quyết")}: ${
                                modules.find((candidate) => candidate.id === module.prerequisiteModuleId)?.title ?? "—"
                              }`
                            : ""}
                        </p>
                      </div>
                      <ChevronDown className="size-4 text-muted-foreground group-open:hidden" aria-hidden="true" />
                    </summary>
                    {module.description && (
                      <p className="border-t px-4 py-2 text-sm text-muted-foreground">{module.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1 border-t px-4 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy || module.position <= 1}
                        onClick={() => course.moveModule.mutate({ moduleId: module.id, direction: "UP" })}
                      >
                        <ChevronUp className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Move up", "Lên")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy || module.position >= modules.length}
                        onClick={() => course.moveModule.mutate({ moduleId: module.id, direction: "DOWN" })}
                      >
                        <ChevronDown className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Move down", "Xuống")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => startEditModule(module)}>
                        <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Edit module", "Sửa chương")}
                      </Button>
                    </div>

                    {editingModule?.id === module.id && (
                      <form onSubmit={saveModule} className="space-y-2 border-t bg-muted/20 px-4 py-3">
                        <Input
                          aria-label={t("Module title", "Tên chương")}
                          value={editModuleTitle}
                          maxLength={255}
                          onChange={(event) => setEditModuleTitle(event.target.value)}
                        />
                        <Input
                          aria-label={t("Module description", "Mô tả chương")}
                          value={editModuleDescription}
                          onChange={(event) => setEditModuleDescription(event.target.value)}
                        />
                        <select
                          aria-label={t("Prerequisite module", "Chương tiên quyết")}
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={editModulePrerequisite}
                          onChange={(event) => setEditModulePrerequisite(event.target.value)}
                        >
                          <option value="">{t("No module prerequisite", "Không có chương tiên quyết")}</option>
                          {modules
                            .filter((candidate) => candidate.position < module.position)
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.position}. {candidate.title}
                              </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy}>
                            {t("Save module", "Lưu chương")}
                          </Button>
                          <Button size="sm" type="button" variant="ghost" onClick={() => setEditingModule(null)}>
                            {t("Cancel", "Hủy")}
                          </Button>
                        </div>
                      </form>
                    )}

                    {module.items.length > 0 ? (
                      <ol className="divide-y border-t">
                        {module.items.map((item) => {
                          const meta = TYPE_META[item.type] ?? TYPE_META.THEORY;
                          const Icon = meta.icon;
                          return (
                            <li key={item.id} className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <Badge variant="outline">{t(meta.en, meta.vi)}</Badge>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                                {!item.required && <Badge variant="secondary">{t("Optional", "Không bắt buộc")}</Badge>}
                              </div>
                              {item.description && (
                                <p className="mt-1 pl-6 text-xs text-muted-foreground">{item.description}</p>
                              )}
                              {item.assignmentId && (
                                <p className="mt-1 pl-6 text-xs text-muted-foreground">
                                  {t("Linked Lab", "Lab liên kết")}:{" "}
                                  {assignmentRows.find((assignment) => assignment.id === item.assignmentId)?.title ?? item.assignmentId}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-1 pl-6">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => course.moveItem.mutate({ moduleId: module.id, itemId: item.id, direction: "UP" })}
                                >
                                  <ChevronUp className="size-3.5" aria-hidden="true" />
                                  <span className="sr-only">{t("Move up", "Lên")}</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => course.moveItem.mutate({ moduleId: module.id, itemId: item.id, direction: "DOWN" })}
                                >
                                  <ChevronDown className="size-3.5" aria-hidden="true" />
                                  <span className="sr-only">{t("Move down", "Xuống")}</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingItem({ moduleId: module.id, itemId: item.id, draft: draftFromItem(item) })}
                                >
                                  <Pencil className="size-3.5" aria-hidden="true" />
                                  <span className="sr-only">{t("Edit", "Sửa")}</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(t("Delete this learning item?", "Xóa nội dung học này?"))) {
                                      course.deleteItem.mutate({ moduleId: module.id, itemId: item.id });
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3.5" aria-hidden="true" />
                                  <span className="sr-only">{t("Delete", "Xóa")}</span>
                                </Button>
                              </div>
                              {editingItem?.itemId === item.id && (
                                <form onSubmit={saveItem} className="mt-3 space-y-2 rounded-lg border bg-muted/20 p-3">
                                  <ItemFields
                                    draft={editingItem.draft}
                                    onChange={(patch) =>
                                      setEditingItem((current) =>
                                        current ? { ...current, draft: { ...current.draft, ...patch } } : current,
                                      )
                                    }
                                    assignments={assignmentRows}
                                    t={t}
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" disabled={busy || !draftValid(editingItem.draft)}>
                                      {t("Save item", "Lưu nội dung")}
                                    </Button>
                                    <Button size="sm" type="button" variant="ghost" onClick={() => setEditingItem(null)}>
                                      {t("Cancel", "Hủy")}
                                    </Button>
                                  </div>
                                </form>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                        {t("No learning items in this module yet.", "Chương này chưa có nội dung học.")}
                      </p>
                    )}

                    <details className="border-t px-4 py-3">
                      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <Plus className="size-4" aria-hidden="true" />
                        {t("Add learning item", "Thêm nội dung học")}
                      </summary>
                      <form onSubmit={(event) => addItem(module.id, event)} className="mt-3 space-y-3">
                        <ItemFields
                          draft={draft}
                          onChange={(patch) => updateDraft(module.id, patch)}
                          assignments={assignmentRows}
                          t={t}
                        />
                        <Button size="sm" disabled={busy || !draftValid(draft)}>
                          {course.addItem.isPending
                            ? t("Saving…", "Đang lưu…")
                            : t("Add item", "Thêm nội dung")}
                        </Button>
                      </form>
                    </details>
                  </details>
                </li>
                );
              })}
            </ol>

          {course.addItem.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t(
                "Could not add the learning item. Verify the linked Lab belongs to this class and required content is filled.",
                "Không thêm được nội dung. Kiểm tra Lab liên kết thuộc lớp này và nội dung bắt buộc đã nhập.",
              )}
            </p>
          )}
          {course.updateItem.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("Could not update the learning item.", "Không cập nhật được nội dung.")}
            </p>
          )}
          {course.deleteItem.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("Could not delete the learning item.", "Không xóa được nội dung.")}
            </p>
          )}
          {course.updateModule.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("Could not update the module.", "Không cập nhật được chương.")}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-xs text-muted-foreground">
              {course.versions.data?.length
                ? `${t("Published immutable versions:", "Phiên bản đã publish bất biến:")} ${course.versions.data
                    .map((version) => `v${version.version} (${version.snapshotDigest.slice(0, 18)}…)`)
                    .join(" · ")}`
                : t("No published version yet.", "Chưa có phiên bản được publish.")}
            </div>
            <Button
              type="button"
              disabled={!modules.length || course.publish.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Publish an immutable snapshot of this course roadmap?",
                      "Publish bản snapshot bất biến của lộ trình khóa học?",
                    ),
                  )
                )
                  course.publish.mutate();
              }}
            >
              {course.publish.isPending
                ? t("Publishing…", "Đang publish…")
                : t("Publish course version", "Publish phiên bản khóa học")}
            </Button>
          </div>
          {course.publish.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t(
                "Course could not be published. Every module needs at least one item and linked Labs must belong to this class.",
                "Không publish được khóa học. Mỗi chương cần ít nhất một nội dung và Lab liên kết phải thuộc lớp này.",
              )}
            </p>
          )}
          {course.publish.isSuccess && (
            <div role="status" className="space-y-2 text-sm text-success">
              <p>
                {t("Published immutable version", "Đã publish phiên bản bất biến")} v
                {course.publish.data.version} · {course.publish.data.snapshotDigest}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={course.startDraft.isPending}
                onClick={() => course.startDraft.mutate()}
              >
                {t("Continue in a new draft", "Tiếp tục bằng bản nháp mới")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
