"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Code2,
  ExternalLink,
  Eye,
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
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";
import { labTierMeta, resolveLabTier } from "@/features/assignments/requirements";

const itemTypes = ["THEORY", "QUIZ", "ESSAY", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const;
type ItemType = (typeof itemTypes)[number];

const TYPE_META: Record<ItemType, { en: string; vi: string; icon: LucideIcon }> = {
  THEORY: { en: "Theory Lab", vi: "Lab chỉ Lý thuyết", icon: BookOpen },
  QUIZ: { en: "Theory + Quiz Lab", vi: "Lab Lý thuyết + Quiz", icon: HelpCircle },
  ESSAY: { en: "Essay", vi: "Tự luận", icon: FileText },
  STATIC_LAB: { en: "Theory Only Lab", vi: "Lab chỉ Lý thuyết", icon: Code2 },
  IMPACT_LAB: { en: "Theory + Quiz Lab", vi: "Lab Lý thuyết + Quiz", icon: GitFork },
  RUNTIME_LAB: { en: "Theory + Quiz + Studio Lab", vi: "Lab Lý thuyết + Quiz + Studio", icon: Play },
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
  type: "IMPACT_LAB",
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

function itemTypeForAssignment(assignment: {
  labMode?: string | null | undefined;
  requireRuntimeTrace?: boolean | null | undefined;
  aiPolicy?: unknown;
}): ItemType {
  const tier = resolveLabTier(assignment);
  if (tier === "THEORY_QUIZ_STUDIO") return "RUNTIME_LAB";
  if (tier === "THEORY_ONLY") return "STATIC_LAB";
  return "IMPACT_LAB";
}

function ItemFields({
  draft,
  onChange,
  assignments,
  t,
}: {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  assignments: Array<{
    id: string;
    title: string;
    instructions?: string;
    labMode?: string | null;
    requireRuntimeTrace?: boolean;
    aiPolicy?: unknown;
  }>;
  t: (en: string, vi: string) => string;
}) {
  const isLegacyRawTheory = draft.type === "THEORY" && !draft.assignmentId;
  const labs =
    draft.type === "RUNTIME_LAB"
      ? assignments.filter((assignment) => assignment.requireRuntimeTrace)
      : assignments;
  const needsAssignment = !isLegacyRawTheory;
  return (
    <div className="space-y-3">
      {needsAssignment && (
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Select created Lab", "Chọn bài Lab đã tạo (từ tab Tạo Lab)")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.assignmentId}
            onChange={(event) => {
              const nextId = event.target.value;
              const picked = assignments.find((a) => a.id === nextId);
              if (picked) {
                onChange({
                  assignmentId: nextId,
                  type: itemTypeForAssignment(picked),
                  title: draft.title.trim() ? draft.title : picked.title,
                  description: draft.description.trim()
                    ? draft.description
                    : (picked.instructions?.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 160) ?? ""),
                });
              } else {
                onChange({ assignmentId: "" });
              }
            }}
          >
            <option value="">{t("Choose a Lab in this class…", "Chọn bài Lab trong lớp này…")}</option>
            {(labs.length > 0 ? labs : assignments).map((assignment) => {
              const tier = resolveLabTier(assignment);
              const meta = labTierMeta(tier);
              return (
                <option key={assignment.id} value={assignment.id}>
                  [{t(meta.shortEn, meta.shortVi)}] {assignment.title}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Lab tier in this chapter", "Cấp độ bài Lab trong Chương / Mốc")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.type}
            onChange={(event) => onChange({ type: event.target.value as ItemType })}
          >
            {(["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const).map((type) => (
              <option key={type} value={type}>
                {t(TYPE_META[type].en, TYPE_META[type].vi)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Display title in chapter", "Tên hiển thị trong chương")}</span>
          <Input
            required
            maxLength={255}
            value={draft.title}
            placeholder={t("Auto-filled when you pick a Lab", "Tự động điền khi chọn bài Lab")}
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
      {isLegacyRawTheory && (
        <div className="space-y-1.5">
          <label className="space-y-1 text-xs font-medium">
            <span>{t("Theory content", "Nội dung lý thuyết")}</span>
            <Textarea
              rows={7}
              value={draft.body}
              onChange={(event) => onChange({ body: event.target.value })}
            />
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={draft.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        {t("Required Lab in this milestone", "Bài Lab bắt buộc trong Mốc này")}
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
  const [selectedItem, setSelectedItem] = useState<{ moduleId: string; itemId: string } | null>(null);

  useEffect(() => {
    setTitle(course.data?.title ?? "");
    setDescription(course.data?.description ?? "");
  }, [course.data?.id, course.data?.title, course.data?.description]);

  if (course.isPending) {
    return <p className="text-sm text-muted-foreground">{t("Loading course builder…", "Đang tải trình tạo khóa học…")}</p>;
  }

  const data = course.data;
  const modules = (data?.modules as Module[] | undefined) ?? [];
  const assignmentRows = (assignments.data ?? []) as Array<{
    id: string;
    title: string;
    instructions?: string;
    labMode?: string | null;
    requireRuntimeTrace?: boolean;
    aiPolicy?: unknown;
  }>;
  const busy =
    course.save.isPending ||
    course.addModule.isPending ||
    course.updateModule.isPending ||
    course.moveModule.isPending ||
    course.deleteModule.isPending ||
    course.addItem.isPending ||
    course.updateItem.isPending ||
    course.moveItem.isPending ||
    course.deleteItem.isPending;

  const inspectedItem = (() => {
    const targetId = editingItem?.itemId ?? selectedItem?.itemId;
    for (const mod of modules) {
      const visibleItems = mod.items.filter((item) => item.type !== "ESSAY");
      const found = targetId ? visibleItems.find((item) => item.id === targetId) : visibleItems[0];
      if (found) return { module: mod, item: found };
    }
    return null;
  })();
  const isDraft = data?.status === "DRAFT";

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

      {data && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
          <div className="space-y-4">
            {isDraft && (
              <>
                <form onSubmit={addModule} className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
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
                    className="rounded-md border bg-background px-3 py-2 text-sm"
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
              </>
            )}

            <ol className="space-y-3">
              {modules.map((module) => {
                const draft = draftFor(module.id);
                const visibleItems = module.items.filter((item) => item.type !== "ESSAY");
                const resolveBuilderItemType = (item: (typeof visibleItems)[number]) => {
                  const linked = item.assignmentId
                    ? assignmentRows.find((a) => a.id === item.assignmentId)
                    : undefined;
                  if (linked && ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type)) {
                    return itemTypeForAssignment(linked);
                  }
                  return item.type;
                };
                const theoryOnlyCount = visibleItems.filter((i) => {
                  const rt = resolveBuilderItemType(i);
                  return rt === "THEORY" || rt === "STATIC_LAB";
                }).length;
                const quizLabCount = visibleItems.filter((i) => {
                  const rt = resolveBuilderItemType(i);
                  return rt === "QUIZ" || rt === "IMPACT_LAB";
                }).length;
                const studioLabCount = visibleItems.filter(
                  (i) => resolveBuilderItemType(i) === "RUNTIME_LAB",
                ).length;
                const breakdown = [
                  theoryOnlyCount > 0
                    ? `${theoryOnlyCount} ${t("Theory Only", "Chỉ Lý thuyết")}`
                    : null,
                  quizLabCount > 0
                    ? `${quizLabCount} ${t("Theory + Quiz", "Lý thuyết + Quiz")}`
                    : null,
                  studioLabCount > 0
                    ? `${studioLabCount} ${t("Full Studio", "Có cả Studio")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
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
                            {visibleItems.length}{" "}
                            {visibleItems.length === 1 ? t("Lab", "bài Lab") : t("Labs", "bài Lab")}
                            {breakdown ? ` · ${breakdown}` : ""}
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
                      {isDraft && (
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
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t(
                                    `Delete module "${module.title}" and all its items?`,
                                    `Xóa chương "${module.title}" và toàn bộ nội dung bên trong?`,
                                  ),
                                )
                              ) {
                                course.deleteModule.mutate({ moduleId: module.id });
                              }
                            }}
                          >
                            <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
                            {t("Delete module", "Xóa chương")}
                          </Button>
                        </div>
                      )}

                      {isDraft && editingModule?.id === module.id && (
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

                      {visibleItems.length > 0 ? (
                        <ol className="divide-y border-t">
                          {visibleItems.map((item, idx) => {
                            const linkedAssignment = item.assignmentId
                              ? assignmentRows.find((a) => a.id === item.assignmentId)
                              : undefined;
                            const resolvedType = linkedAssignment
                              ? itemTypeForAssignment(linkedAssignment)
                              : item.type;
                            const meta = TYPE_META[resolvedType] ?? TYPE_META.THEORY;
                            const Icon = meta.icon;
                            const isInspected = inspectedItem?.item.id === item.id;
                            return (
                              <li
                                key={item.id}
                                className={`px-4 py-3 transition-colors ${isInspected ? "bg-primary/5" : ""}`}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                                    Lab {idx + 1}
                                  </span>
                                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  <Badge variant="outline">{t(meta.en, meta.vi)}</Badge>
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary hover:underline"
                                    onClick={() => setSelectedItem({ moduleId: module.id, itemId: item.id })}
                                  >
                                    {item.title}
                                  </button>
                                  {!item.required && <Badge variant="secondary">{t("Optional", "Không bắt buộc")}</Badge>}
                                </div>
                                {item.description && (
                                  <p className="mt-1 pl-6 text-xs text-muted-foreground">{item.description}</p>
                                )}
                                {item.assignmentId && (
                                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                                    {t("Linked Lab", "Lab liên kết")}:{" "}
                                    {linkedAssignment?.title ?? item.assignmentId}
                                  </p>
                                )}
                                {isDraft && (
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
                                      onClick={() => {
                                        setSelectedItem({ moduleId: module.id, itemId: item.id });
                                        setEditingItem({ moduleId: module.id, itemId: item.id, draft: draftFromItem(item) });
                                      }}
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
                                        if (window.confirm(t("Remove this Lab from the module?", "Xóa bài Lab này khỏi chương?"))) {
                                          course.deleteItem.mutate({ moduleId: module.id, itemId: item.id });
                                        }
                                      }}
                                    >
                                      <Trash2 className="size-3.5" aria-hidden="true" />
                                      <span className="sr-only">{t("Delete", "Xóa")}</span>
                                    </Button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
                          <span>
                            {t(
                              "No Labs assigned to this milestone yet.",
                              "Chương (Mốc) này chưa được gắn bài Lab nào.",
                            )}
                          </span>
                          {isDraft && assignmentRows.length > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                void (async () => {
                                  for (const a of assignmentRows) {
                                    await course.addItem.mutateAsync({
                                      moduleId: module.id,
                                      type: itemTypeForAssignment(a),
                                      title: a.title,
                                      description:
                                        a.instructions
                                          ?.split("\n")[0]
                                          ?.replace(/^#+\s*/, "")
                                          .slice(0, 160) ?? "",
                                      required: true,
                                      content: {},
                                      assignmentId: a.id,
                                    });
                                  }
                                })();
                              }}
                            >
                              ⚡{" "}
                              {t(
                                `Assign all ${assignmentRows.length} created Lab(s) to this module`,
                                `Gắn nhanh ${assignmentRows.length} bài Lab đã tạo vào Chương này`,
                              )}
                            </Button>
                          )}
                        </div>
                      )}

                      {isDraft && (
                        <details className="border-t px-4 py-3">
                          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300">
                            <Plus className="size-4" aria-hidden="true" />
                            {t("Add Lab to this milestone", "Thêm bài Lab vào Chương / Mốc này")}
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
                                : t("Add Lab to module", "Gắn bài Lab vào Chương")}
                            </Button>
                          </form>
                        </details>
                      )}
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
            {course.deleteModule.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t("Could not delete the module.", "Không xóa được chương.")}
              </p>
            )}
          </div>

          <aside
            aria-label={t("Curriculum Inspector", "Trình xem & sửa học liệu")}
            className="space-y-4 rounded-xl border bg-muted/15 p-4 lg:sticky lg:top-6"
          >
            {isDraft && editingItem ? (
              <form onSubmit={saveItem} className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("Editing Learning Item", "Đang chỉnh sửa nội dung")}
                  </p>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setEditingItem(null)}>
                    {t("Close", "Đóng")}
                  </Button>
                </div>
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
            ) : inspectedItem ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {inspectedItem.module.position}. {inspectedItem.module.title}
                    </p>
                    <h3 className="text-base font-semibold">{inspectedItem.item.title}</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">
                      {t(
                        TYPE_META[inspectedItem.item.type]?.en ?? inspectedItem.item.type,
                        TYPE_META[inspectedItem.item.type]?.vi ?? inspectedItem.item.type,
                      )}
                    </Badge>
                    {isDraft && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingItem({
                            moduleId: inspectedItem.module.id,
                            itemId: inspectedItem.item.id,
                            draft: draftFromItem(inspectedItem.item),
                          })
                        }
                      >
                        <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Edit", "Sửa")}
                      </Button>
                    )}
                  </div>
                </div>
                {inspectedItem.item.description && (
                  <p className="text-sm text-muted-foreground">{inspectedItem.item.description}</p>
                )}
                {inspectedItem.item.type === "THEORY" && (
                  <div className="rounded-lg border bg-background p-3">
                    {typeof inspectedItem.item.content?.["body"] === "string" &&
                    inspectedItem.item.content["body"].trim() ? (
                      <MarkdownPreview markdown={inspectedItem.item.content["body"]} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("No theory Markdown body written yet.", "Chưa có nội dung Markdown lý thuyết.")}
                      </p>
                    )}
                  </div>
                )}
                {inspectedItem.item.type === "ESSAY" && (
                  <div className="space-y-2 rounded-lg border bg-background p-3 text-sm">
                    <p className="font-medium">{String(inspectedItem.item.content?.["prompt"] ?? "")}</p>
                    {Array.isArray(inspectedItem.item.content?.["rubric"]) && (
                      <ul className="list-disc pl-5 text-xs text-muted-foreground">
                        {(inspectedItem.item.content["rubric"] as Array<{ criterion?: string; maxScore?: number }>).map(
                          (entry, idx) => (
                            <li key={idx}>
                              {entry.criterion} · {entry.maxScore} pts
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                )}
                {inspectedItem.item.assignmentId && (
                  <div className="space-y-2 rounded-lg border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Linked Assignment / Lab", "Bài Lab / Quiz liên kết")}
                    </p>
                    <p className="text-sm font-medium">
                      {assignmentRows.find((a) => a.id === inspectedItem.item.assignmentId)?.title ??
                        inspectedItem.item.assignmentId}
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(inspectedItem.item.assignmentId)}`}
                      >
                        <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
                        {t("Open in Lab Authoring Studio", "Mở trong trình soạn Lab")}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Add a module on the left or click an item to preview and edit its content here.",
                  "Thêm chương bên trái hoặc bấm vào một nội dung để xem trước và chỉnh sửa tại đây.",
                )}
              </p>
            )}
          </aside>
        </div>
      )}

      {isDraft && (
        <>
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
